// File: functions/api_matrix.js
export const config = {
  regions: ["iad", "ewr", "lhr", "fra"] // US-East, US-Newark, London, Frankfurt
};

export async function onRequest(context) {
    const { request, env } = context;
    const corsHeaders = {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "POST, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type",
    };

    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders });

    if (request.method === "POST") {
        try {
            const apiKey = env.GOOGLE_API_KEY;
            if (!apiKey) throw new Error("Thiếu API Key");

            // Sử dụng model Flash cho tốc độ và khả năng tuân thủ cấu trúc tốt
            const MODEL_NAME = "gemini-2.0-flash-exp";
            const API_URL = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL_NAME}:streamGenerateContent?alt=sse&key=${apiKey}`;

            const body = await request.json();
            const { 
                license_key, topics, subject, grade, semester, 
                exam_type, time, use_short_answer, 
                totalPeriodsHalf1, totalPeriodsHalf2,
                book_series 
            } = body;
            
            // --- 1. CHECK LICENSE ---
            if (env.TEST_TOOL && license_key) { 
                const creditStr = await env.TEST_TOOL.get(license_key); 
                if (!creditStr || parseInt(creditStr) <= 0) {
                    return new Response(JSON.stringify({ error: "License không hợp lệ hoặc hết hạn!" }), { status: 403, headers: corsHeaders });
                }
            }

            // --- 2. XỬ LÝ MÔ TẢ CHỦ ĐỀ (INPUT DATA) ---
            // Chuyển đổi dữ liệu JSON thành văn bản có cấu trúc rõ ràng để AI đọc
            let topicsDescription = "";
            let totalUnitCount = 0;
            topics.forEach((topic, index) => {
                topicsDescription += `\n- CHỦ ĐỀ LỚN ${index + 1}: ${topic.name.toUpperCase()}\n`;
                topic.units.forEach((unit, uIndex) => {
                    totalUnitCount++;
                    let periodInfo = exam_type === 'hk' 
                        ? `(Tiết HK1: ${unit.p1}, Tiết HK2: ${unit.p2})` 
                        : `(Tổng tiết: ${unit.p1})`;
                    // Đánh dấu rõ ràng để AI biết đây là đơn vị kiến thức cần điền vào ma trận
                    topicsDescription += `   + Đơn vị kiến thức ${totalUnitCount}: "${unit.content}" ${periodInfo}\n`;
                });
            });
           
            // --- 3. XÁC ĐỊNH CẤU TRÚC ĐỀ THI (LOGIC CỨNG) ---
            let structureInstruction = "";
            let matrixColumnsInstruction = ""; // Hướng dẫn cụ thể cho các cột
            
            if (use_short_answer) {
                // Cấu trúc MỚI (2025): 3 Phần
                structureInstruction = `
                **MÔ HÌNH ĐỀ THI: CẤU TRÚC MỚI 2025 (3 PHẦN)**
                1. Phần I: Trắc nghiệm nhiều lựa chọn (MCQ) - 4 phương án, chọn 1.
                2. Phần II: Trắc nghiệm Đúng/Sai (T/F) - Câu chùm 4 lệnh hỏi.
                3. Phần III: Trắc nghiệm Trả lời ngắn (SA) - Điền đáp số.
                `;
            } else {
                // Cấu trúc CŨ: 2 Phần
                structureInstruction = `
                **MÔ HÌNH ĐỀ THI: CẤU TRÚC TRUYỀN THỐNG (2 PHẦN)**
                1. Phần I: Trắc nghiệm khách quan (MCQ).
                2. Phần II: Tự luận (Essay).
                **CẢNH BÁO QUAN TRỌNG:** TUYỆT ĐỐI KHÔNG tạo câu hỏi dạng "Trả lời ngắn". Phần III trong đề phải được thay thế hoàn toàn bằng Tự Luận hoặc dồn điểm sang phần khác.
                `;
            }

            // --- 4. LOGIC SỐ LƯỢNG CÂU HỎI (HARD CONSTRAINTS) ---
            // Định nghĩa rõ số lượng câu hỏi dựa trên thời gian để AI không được phép sáng tạo phần này
            let questionDistribution = "";
            if (parseInt(time) >= 60) {
                questionDistribution = `
                **BẢNG QUOTA SỐ LƯỢNG CÂU HỎI (BẮT BUỘC TUÂN THỦ 100%):**
                - Thời gian làm bài: ${time} phút (>= 60p).
                - TỔNG SỐ CÂU CẦN CÓ TRONG ĐỀ:
                  + Phần I (MCQ): **12 câu** (0.25 điểm/câu = 3.0 điểm).
                  + Phần II (Đúng/Sai): **2 câu** (Mỗi câu 4 lệnh, tính điểm thang đặc biệt = 4.0 điểm).
                  + Phần III/IV (Trả lời ngắn/Tự luận): 
                    * Nếu dùng Trả lời ngắn: **4 câu** (0.5 điểm/câu = 2.0 điểm) + **1 câu Tự luận** (1.0 điểm).
                    * Nếu KHÔNG dùng Trả lời ngắn: **2-3 câu Tự luận** (Tổng 3.0 điểm).
                `;
            } else {
                questionDistribution = `
                **BẢNG QUOTA SỐ LƯỢNG CÂU HỎI (BẮT BUỘC TUÂN THỦ 100%):**
                - Thời gian làm bài: ${time} phút (<= 45p).
                - TỔNG SỐ CÂU CẦN CÓ TRONG ĐỀ:
                  + Phần I (MCQ): **6 câu** (0.5 điểm/câu = 3.0 điểm - Lưu ý điểm số tăng lên).
                  + Phần II (Đúng/Sai): **1 câu** (4 lệnh = 4.0 điểm quy đổi tỷ trọng).
                  + Phần III/IV (Trả lời ngắn/Tự luận): 
                    * Nếu dùng Trả lời ngắn: **4 câu** (0.25-0.5đ/câu) + **1 câu Tự luận**.
                    * Nếu KHÔNG dùng Trả lời ngắn: **1-2 câu Tự luận** (Tổng 3.0 điểm).
                `;
            }

            // --- 5. TẠO PROMPT (PHIÊN BẢN CƯỜNG HÓA) ---
            const prompt = `
            Bạn là Chuyên gia Khảo thí cấp cao của Bộ Giáo dục và Đào tạo Việt Nam. Bạn đang thực hiện nhiệm vụ xây dựng đề kiểm tra ĐỊNH KÌ chính thức.
            
            **NHIỆM VỤ TỐI CAO:** Tạo ra 01 Ma trận đề thi, 01 Bản đặc tả, 01 Đề thi và 01 Hướng dẫn chấm chính xác tuyệt đối về số liệu, tuân thủ cấu trúc HTML nghiêm ngặt.

            ===========================================================
            PHẦN A: DỮ LIỆU ĐẦU VÀO (INPUT CONTEXT)
            ===========================================================
            1. Môn học: ${subject} - Lớp ${grade}.
            2. Bộ sách giáo khoa: **${book_series}**. (Lưu ý: Chỉ sử dụng kiến thức, thuật ngữ thuộc bộ sách này).
            3. Kỳ thi: ${exam_type === 'hk' ? 'Cuối học kì' : 'Giữa học kì'} ${semester}.
            4. Dữ liệu kiến thức cần phủ:
            ${topicsDescription}

            ===========================================================
            PHẦN B: THUẬT TOÁN PHÂN BỔ CÂU HỎI (ALGORITHM)
            ===========================================================
            Hãy thực hiện tính toán từng bước như một máy tính trước khi tạo bảng:

            ${structureInstruction}

            ${questionDistribution}

            **QUY TẮC ĐIỀN DỮ LIỆU VÀO MA TRẬN (LOGIC PHÂN BỐ):**
            1. **Nguyên tắc Phủ kín:** Tất cả các "Đơn vị kiến thức" được liệt kê ở Phần A đều phải xuất hiện trong ma trận. Không được bỏ sót bài nào.
            2. **Nguyên tắc Trọng số:** Bài nào có số tiết nhiều hơn hoặc nội dung quan trọng hơn -> Phân bổ nhiều câu hỏi hơn.
            3. **Nguyên tắc Rải mức độ (QUAN TRỌNG):**
               - **MCQ (Biết/Hiểu):** Phân bổ chủ yếu vào mức Nhận Biết và Thông Hiểu.
               - **Đúng/Sai (Hiểu/Vận dụng):** Phân bổ vào mức Thông Hiểu và Vận Dụng.
               - **Trả lời ngắn/Tự luận (Vận dụng):** Phân bổ vào mức Vận Dụng và Vận Dụng Cao.
               - **CẢNH BÁO:** Không bao giờ để cột "Vận dụng" trống trơn. Bắt buộc phải có câu hỏi phân loại học sinh.
            
            4. **Kiểm tra tính đúng đắn (Validation):** - Tổng số câu MCQ trong cột dọc PHẢI = Quy định ở trên (ví dụ 12 câu).
               - Tổng số câu Đúng/Sai trong cột dọc PHẢI = Quy định ở trên (ví dụ 2 câu).
               - Tổng điểm toàn bài PHẢI = 10.0.

            ===========================================================
            PHẦN C: YÊU CẦU ĐỊNH DẠNG ĐẦU RA (OUTPUT FORMAT)
            ===========================================================
            Bạn chỉ được trả về mã HTML thuần túy. KHÔNG giải thích, KHÔNG chào hỏi.

            **1. BẢNG 1: MA TRẬN ĐỀ KIỂM TRA (HTML TABLE 19 CỘT)**
            *Yêu cầu kỹ thuật:*
            - Sử dụng thẻ <table>, <tr>, <td>, <th>.
            - Các ô gộp (rowspan, colspan) phải chính xác để không vỡ giao diện.

            *Cấu trúc Header Ma trận (Chép y nguyên đoạn mã này):*
            \`\`\`html
            <table border="1" cellpadding="5" cellspacing="0" style="border-collapse:collapse; width:100%;">
                <thead>
                    <tr>
                        <th rowspan="4">TT</th>
                        <th rowspan="4">Chủ đề/Chương</th>
                        <th rowspan="4">Nội dung/Đơn vị kiến thức</th>
                        <th colspan="12">Mức độ đánh giá</th>
                        <th colspan="3">Tổng số câu</th>
                        <th rowspan="4">Tỉ lệ % điểm</th>
                    </tr>
                    <tr>
                        <th colspan="3">Trắc nghiệm (MCQ)</th>
                        <th colspan="3">Đúng/Sai (T/F)</th>
                        <th colspan="3">Trả lời ngắn (SA)</th>
                        <th colspan="3">Tự luận (TL)</th>
                        <th rowspan="3">MCQ</th>
                        <th rowspan="3">Đ/S</th>
                        <th rowspan="3">Khác</th>
                    </tr>
                    <tr>
                        <th colspan="3">Số câu</th>
                        <th colspan="3">Số câu</th>
                        <th colspan="3">Số câu</th>
                        <th colspan="3">Số câu</th>
                    </tr>
                    <tr>
                        <th>B</th><th>H</th><th>VD</th>
                        <th>B</th><th>H</th><th>VD</th>
                        <th>B</th><th>H</th><th>VD</th>
                        <th>B</th><th>H</th><th>VD</th>
                    </tr>
                </thead>
                <tbody>
                    </tbody>
                <tfoot>
                    <tr>
                        <th colspan="3">TỔNG CỘNG</th>
                        <th>...</th><th>...</th><th>...</th>
                        <th>...</th><th>...</th><th>...</th>
                        <th>...</th><th>...</th><th>...</th>
                        <th>...</th><th>...</th><th>...</th>
                        <th>12 (hoặc 6)</th>
                        <th>2 (hoặc 1)</th>
                        <th>...</th>
                        <th>100%</th>
                    </tr>
                </tfoot>
            </table>
            \`\`\`
            *Hướng dẫn điền Body:*
            - Điền từng dòng cho từng "Đơn vị kiến thức".
            - Nếu một ô không có câu hỏi, hãy để trống hoặc ghi số 0 (nhưng tốt nhất là để trống cho thoáng).
            - Đảm bảo tổng dọc các cột khớp với Bảng Quota ở Phần B.

            **2. BẢN 2: BẢN ĐẶC TẢ ĐỀ KIỂM TRA (HTML TABLE 16 CỘT)**
            - Cấu trúc tương tự Ma trận nhưng thêm cột "Yêu cầu cần đạt".
            - Cột "Yêu cầu cần đạt": Mô tả chi tiết hành vi học sinh cần làm (ví dụ: "Nêu được...", "Giải thích được...", "Vận dụng được..."). Xuống dòng mỗi ý bằng thẻ <br>.

            **3. ĐỀ KIỂM TRA CHÍNH THỨC**
            - Tiêu đề: ĐỀ KIỂM TRA ${exam_type === 'hk' ? 'CUỐI' : 'GIỮA'} HỌC KÌ ${semester} - MÔN ${subject.toUpperCase()} ${grade}
            - Thời gian: ${time} phút.
            - Cấu trúc đề: Chia rõ I, II, III (tương ứng với cấu trúc đã chọn).
            - **Định dạng câu hỏi:**
              + MCQ: Câu 1: ... <br> A. ... <br> B. ... <br> C. ... <br> D. ...
              + Đúng/Sai: Câu 1: ... <br> a) ... <br> b) ... (Kẻ bảng hoặc liệt kê).
              + Công thức toán: Dùng LaTeX bao quanh bởi $$ (ví dụ $$x^2$$).
            - **Nội dung:** Câu hỏi phải mới, sáng tạo, không trùng lặp, bám sát sách ${book_series}.

            **4. HƯỚNG DẪN CHẤM VÀ ĐÁP ÁN**
            - Đáp án MCQ: 1-A, 2-C...
            - Đáp án Đúng/Sai: 1a-Đ, 1b-S...
            - Hướng dẫn chấm Tự luận: Chia nhỏ điểm (0.25đ) cho từng bước làm.

            ### LƯU Ý CUỐI CÙNG CHO AI:
            - Hãy kiểm tra lại tổng điểm: (Số câu MCQ * điểm) + (Số câu Đ/S * điểm quy đổi) + (Số câu TLN * điểm) + Tự luận = 10.0.
            - Nếu thấy thiếu điểm, hãy tăng điểm hoặc số lượng câu Tự luận lên.
            - Tuyệt đối không để trống dữ liệu. Nếu không có thông tin cụ thể, hãy tạo ra câu hỏi tổng quát dựa trên tên bài học.
            `;

            // --- 6. THỰC THI GỌI API ---
            const response = await fetch(API_URL, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    contents: [{ parts: [{ text: prompt }] }]
                })
            });

            if (!response.ok) {
                const errText = await response.text();
                throw new Error(`Google API Error (${response.status}): ${errText}`);
            }

            // --- 7. XỬ LÝ STREAM ---
            const { readable, writable } = new TransformStream();
            const writer = writable.getWriter();
            const encoder = new TextEncoder();
            const decoder = new TextDecoder();

            (async () => {
                const reader = response.body.getReader();
                let buffer = "";
                try {
                    while (true) {
                        const { done, value } = await reader.read();
                        if (done) break;
                        const chunk = decoder.decode(value, { stream: true });
                        buffer += chunk;
                        const lines = buffer.split("\n");
                        buffer = lines.pop();

                        for (const line of lines) {
                            if (line.startsWith("data: ")) {
                                const jsonStr = line.substring(6).trim();
                                if (jsonStr === "[DONE]") continue;
                                try {
                                    const parsed = JSON.parse(jsonStr);
                                    const text = parsed.candidates?.[0]?.content?.parts?.[0]?.text;
                                    if (text) await writer.write(encoder.encode(text));
                                } catch (e) {}
                            }
                        }
                    }
                    // Trừ credit
                    if (env.TEST_TOOL && license_key) {
                        const creditStr = await env.TEST_TOOL.get(license_key);
                        if (creditStr) await env.TEST_TOOL.put(license_key, (parseInt(creditStr) - 1).toString());
                    }
                } catch (e) {
                    await writer.write(encoder.encode(`[LỖI]: ${e.message}`));
                } finally {
                    await writer.close();
                }
            })();

            return new Response(readable, {
                headers: { ...corsHeaders, "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-cache" }
            });

        } catch (error) {
            return new Response(JSON.stringify({ error: `System Error: ${error.message}` }), { status: 500, headers: corsHeaders });
        }
    }
}

// --- BIẾN DOCUMENT_CONTENT_7991 (GIỮ NGUYÊN ĐỂ LÀM CĂN CỨ PHÁP LÝ) ---
const DOCUMENT_CONTENT_7991 = `
QUY ĐỊNH CẤU TRÚC MA TRẬN ĐỀ KIỂM TRA (THEO CÔNG VĂN 7991/BGDĐT-GDTrH):
1. Định dạng đề thi:
   - Phần 1: Trắc nghiệm nhiều lựa chọn (MCQ).
   - Phần 2: Trắc nghiệm Đúng/Sai (Câu chùm).
   - Phần 3: Trắc nghiệm Trả lời ngắn HOẶC Tự luận.
2. Quy tắc ma trận:
   - Phải thể hiện 3 mức độ: Nhận biết, Thông hiểu, Vận dụng.
   - Tổng điểm toàn bài: 10.0 điểm.
`;
