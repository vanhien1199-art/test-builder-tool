// File: functions/api_matrix.js
export const config = {
  regions: ["iad", "ewr", "lhr", "fra"] 
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

            const MODEL_NAME = "gemini-2.0-flash-exp";
            const API_URL = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL_NAME}:streamGenerateContent?alt=sse&key=${apiKey}`;

            const body = await request.json();
            let { 
                license_key, topics, subject, grade, semester, 
                exam_type, time, use_short_answer, 
                totalPeriodsHalf1, totalPeriodsHalf2,
                book_series 
            } = body;
            
            // Ép kiểu số
            totalPeriodsHalf1 = parseFloat(totalPeriodsHalf1) || 1;
            totalPeriodsHalf2 = parseFloat(totalPeriodsHalf2) || 1;
            let timeInt = parseInt(time);

            if (env.TEST_TOOL && license_key) { 
                const creditStr = await env.TEST_TOOL.get(license_key); 
                if (!creditStr || parseInt(creditStr) <= 0) {
                    return new Response(JSON.stringify({ error: "License hết hạn!" }), { status: 403, headers: corsHeaders });
                }
            }

            // --- 2. PRE-CALCULATION ---
            let topicsDescription = "";
            topics.forEach((topic, index) => {
                topicsDescription += `\nCHƯƠNG ${index + 1}: ${topic.name}\n`;
                topic.units.forEach((unit, uIndex) => {
                    let p1 = parseFloat(unit.p1) || 0;
                    let p2 = parseFloat(unit.p2) || 0;
                    let calculatedRatio = 0;
                    let timeLabel = "";

                    if (exam_type === 'hk') {
                        if (p2 > 0) {
                             calculatedRatio = (p2 / totalPeriodsHalf2) * 75;
                             timeLabel = `(Nửa sau - Trọng tâm)`;
                        } else {
                             calculatedRatio = (p1 / totalPeriodsHalf1) * 25;
                             timeLabel = `(Nửa đầu - Ôn tập)`;
                        }
                    } else {
                        calculatedRatio = (p1 / totalPeriodsHalf1) * 100;
                        timeLabel = `(Số tiết: ${p1})`;
                    }

                    let ratioStr = calculatedRatio.toFixed(1);
                    if (ratioStr === "0.0" && (p1 > 0 || p2 > 0)) ratioStr = "2.5"; 

                    topicsDescription += `   - Bài ${uIndex + 1}: ${unit.content} ${timeLabel} -> [BẮT BUỘC ĐIỀN CỘT 19 LÀ: ${ratioStr}%]\n`;
                });
            });
           
            // --- 3. XỬ LÝ LOGIC CẤU TRÚC & QUOTA CỨNG ---
            let structurePrompt = "";
            let scoreCoefficientInstruction = "";
            let quotaPrompt = "";

            if (use_short_answer) {
                // === TRƯỜNG HỢP CÓ TRẢ LỜI NGẮN (4 PHẦN) ===
                structurePrompt = `
                CẤU TRÚC ĐỀ THI (4 PHẦN - BẮT BUỘC):
                - Phần I: Trắc nghiệm MCQ (4 chọn 1).
                - Phần II: Trắc nghiệm Đúng/Sai (Mỗi câu 4 ý).
                - Phần III: Trắc nghiệm Trả lời ngắn.
                - Phần IV: Tự luận.
                `;

                if (timeInt >= 60) {
                    // >= 60 phút: Giữ nguyên cấu trúc chuẩn
                    quotaPrompt = `
                    * **QUOTA BẮT BUỘC (>= 60 phút):**
                      - Phần I (MCQ): **12 câu** (0.25đ/câu -> 3.0đ).
                      - Phần II (Đúng/Sai): **4 câu** (1.0đ/câu -> 4.0đ).
                      - Phần III (Trả lời ngắn): **4 câu** (0.5đ/câu -> 2.0đ).
                      - Phần IV (Tự luận): **1 đến 3 câu** (1.0-2.0đ/câu -> 3.0đ).
                    `;
                    scoreCoefficientInstruction = `**HỆ SỐ ĐIỂM:** MCQ=0.25; TLN=0.5; Đ/S=1.0/câu chùm; Tự luận=1.0-2.0đ.`;
                } else {
                    // <= 45 phút: CẬP NHẬT THEO YÊU CẦU MỚI
                    quotaPrompt = `
                    * **QUOTA BẮT BUỘC (<= 45 phút) - LƯU Ý ĐIỂM SỐ:**
                      - Phần I (MCQ): **6 câu** (0.5 điểm/câu -> Tổng 3.0đ).
                      - Phần II (Đúng/Sai): **1 câu** (4 ý, mỗi ý đúng 0.5đ -> Tổng 2.0đ).
                      - Phần III (Trả lời ngắn): **4 câu** (0.5 điểm/câu -> Tổng 2.0đ).
                      - Phần IV (Tự luận): **1 đến 3 câu** (1.0-2.0đ/câu -> 3.0đ).
                    `;
                    // Cập nhật hệ số điểm để AI tính Footer đúng
                    scoreCoefficientInstruction = `**HỆ SỐ ĐIỂM ĐẶC BIỆT (45p):** MCQ=0.5; TLN=0.5; Đ/S=0.5 (mỗi ý nhỏ); Tự luận=Tổng 3.0đ.`;
                }

            } else {
                // === TRƯỜNG HỢP KHÔNG CÓ TRẢ LỜI NGẮN (2 PHẦN) ===
                structurePrompt = `
                CẤU TRÚC ĐỀ THI (2 PHẦN):
                - Phần I: Trắc nghiệm MCQ.
				- Phần II (Đúng/Sai).
                - Phần III: Tự luận.
                *** CẤM: KHÔNG ĐƯỢC TẠO CÂU HỎI TRẢ LỜI NGẮN ***
                `;
                
                if (timeInt >= 60) {
                    quotaPrompt = `
                    * **QUOTA BẮT BUỘC (>= 60 phút):**
                      - Phần I (MCQ): **12 câu** (3.0 điểm).
                      - Phần II (Đúng/Sai): **4 câu** (4.0 điểm).
                      - Phần III (Tự luận): **2-3 câu** (3.0 điểm).
                    `;
                    scoreCoefficientInstruction = `**HỆ SỐ ĐIỂM:** MCQ=0.25; Đ/S=1.0; Tự luận=Tùy ý.`;
                } else {
                    quotaPrompt = `
                    * **QUOTA BẮT BUỘC (<= 45 phút):**
                      - Phần I (MCQ): **6 câu** (0.5 điểm/câu -> Tổng 3.0đ).
                      - Phần II (Đúng/Sai): **2 câu** (4 ý, mỗi ý đúng 0.5đ -> Tổng 4.0đ).
                      - Phần IV (Tự luận): ***1 đến 3 câu** (1.0-2.0đ/câu -> 3.0đ).
                    `;
                    scoreCoefficientInstruction = `**HỆ SỐ ĐIỂM ĐẶC BIỆT (45p):** MCQ=0.5; TLN=0.5; Đ/S=0.5 (mỗi ý nhỏ); Tự luận=Tổng 3.0đ.`;
                }
            }

            const prompt = `
            Bạn là Chuyên gia Khảo thí. Nhiệm vụ: Xây dựng Ma trận đề thi chuẩn 2025.

            ### BƯỚC 1: DỮ LIỆU ĐẦU VÀO & GIỚI HẠN ĐỘ KHÓ
            1. Môn: ${subject} - Lớp ${grade} - Bộ sách: **${book_series}**.
            2. Cấu trúc: 
            ${structurePrompt}
            3. Nội dung chi tiết & Giới hạn mức độ nhận thức (Scope):
            ${topicsDescription}
            *(Lưu ý: Hãy tuân thủ nghiêm ngặt chỉ dẫn [Mức độ cho phép...] ở trên. Nếu bài ghi "Cấm Vận dụng" thì tuyệt đối không tích vào ô Vận dụng).*

            ### BƯỚC 2: QUY TẮC PHÂN BỔ TỈ LỆ NHẬN THỨC (LOGIC 4-3-3)
            Bạn phải phân bổ số câu hỏi sao cho tổng điểm đạt tỉ lệ chuẩn sau:
            
            1. **Mức NHẬN BIẾT (Chiếm ~40% = 4.0 điểm):**
               - Ưu tiên dồn vào phần **MCQ** (Trắc nghiệm nhiều lựa chọn).
               - Hầu hết các bài học đều phải có câu hỏi mức Biết.
            
            2. **Mức THÔNG HIỂU (Chiếm ~30% = 3.0 điểm):**
               - Phân bổ vào phần **MCQ** và **Đúng/Sai**.
               - Phần Tự luận cũng cần có ý nhỏ mức Hiểu.

            3. **Mức VẬN DỤNG (Chiếm ~30% = 3.0 điểm) - GIỚI HẠN TRẦN:**
               - **CẢNH BÁO:** Tổng điểm các câu mức Vận dụng **KHÔNG ĐƯỢC VƯỢT QUÁ 3.5 điểm**. Đừng làm đề quá khó.
               - Dồn mức này vào phần **Trả lời ngắn** và **Tự luận**.
               - Phần MCQ hạn chế tối đa mức Vận dụng (chỉ 1-2 câu nếu cần thiết).

            ### BƯỚC 3: QUOTA SỐ LƯỢNG (HARD CONSTRAINT)
            ${quotaPrompt}
            *(Bắt buộc điền đúng số lượng này vào dòng Tổng số câu)*.

            ### BƯỚC 4: XUẤT DỮ LIỆU (HTML OUTPUT)
            
            **1. MA TRẬN ĐỀ KIỂM TRA**
            *Logic Footer:*
            - Cột 19: Copy y nguyên con số [KPI CỘT 19: ...] từ dữ liệu đầu vào.
            - Dòng Tổng điểm: Tính tổng điểm Biết/Hiểu/VD dựa trên hệ số (${scoreCoefficientInstruction}).
              + Kiểm tra lại: Tổng điểm Biết phải xấp xỉ 4.0.
              + Tổng điểm VD phải xấp xỉ 3.0 (không quá cao).

            *Copy cấu trúc Table sau:*
            \`\`\`html
            <table border="1" style="border-collapse:collapse; width:100%; text-align:center;">
                <thead>
                    <tr>
                        <th rowspan="4">TT</th>
                        <th rowspan="4">Chủ đề/Chương</th>
                        <th rowspan="4">Nội dung/Đơn vị kiến thức</th>
                        <th colspan="12">Mức độ đánh giá</th>
                        <th colspan="3">Tổng (Theo mức độ)</th>
                        <th rowspan="4">Tỉ lệ % điểm</th>
                    </tr>
                    <tr>
                        <th colspan="9">TNKQ</th>
                        <th colspan="3">Tự luận (TL)</th>
                        <th colspan="3"></th>
                    </tr>
                    <tr>
                        <th colspan="3">Nhiều lựa chọn</th>
                        <th colspan="3">Đúng-Sai</th>
                        <th colspan="3">Trả lời ngắn</th>
                        <th colspan="3">Tự luận</th>
						<th colspan="3"></th>
                    </tr>
                    <tr>
                        <th>Biết</th><th>Hiểu</th><th>VD</th>
                        <th>Biết</th><th>Hiểu</th><th>VD</th>
                        <th>Biết</th><th>Hiểu</th><th>VD</th>
                        <th>Biết</th><th>Hiểu</th><th>VD</th>
						<th>Biết</th><th>Hiểu</th><th>VD</th>
                    </tr>
                </thead>
                <tbody>
                    </tbody>
                <tfoot>
                    <tr>
                        <th colspan="3">Tổng số câu</th>
                        <th>(Sum)</th><th>(Sum)</th><th>(Sum)</th>
                        <th>(Sum)</th><th>(Sum)</th><th>(Sum)</th>
                        <th>(Sum)</th><th>(Sum)</th><th>(Sum)</th>
                        <th>(Sum)</th><th>(Sum)</th><th>(Sum)</th>
                        <th>(=Tổng câu Biết)</th>
                        <th>(=Tổng câu Hiểu)</th>
                        <th>(=Tổng câu VD)</th>
                        <th></th>
                    </tr>
                     <tr>
                        <th colspan="3">Tổng điểm</th>
                        <th colspan="3">3.0</th>
                        <th colspan="3">4.0 (hoặc 2.0)</th>
                        <th colspan="3">2.0 (hoặc 0)</th>
                        <th colspan="3">1.0 (hoặc 3.0)</th>
                        <th>(=Điểm Biết ~4.0)</th>
                        <th>(=Điểm Hiểu ~3.0)</th>
                        <th>(=Điểm VD ~3.0)</th>
						<th>10.0</th>
                    </tr>
                    <tr>
                        <th colspan="3">Tỉ lệ %</th>
                        <th colspan="3">30%</th>
                        <th colspan="3">40% (hoặc 20%)</th>
                        <th colspan="3">20% (hoặc 0%)</th>
                        <th colspan="3">10% (hoặc 30%)</th>
                        <th>~40%</th>
                        <th>~30%</th>
                        <th>~30%</th>
                        <th>100%</th>
                    </tr>
                </tfoot>
            </table>
            \`\`\`
            **2. BẢN ĐẶC TẢ ĐỀ KIỂM TRA**
           *Tạo bảng HTML có 16 cột:*
            * Cột 1-3: Giống phần Ma trận.
            * Cột 4: **Yêu cầu cần đạt** (Mô tả chi tiết kiến thức/kỹ năng cần kiểm tra cho từng mức độ Biết/Hiểu/Vận dụng, mỗi ý xuống dòng bằng thẻ '<br>').
            * Cột 5-16: Số câu hỏi ở các mức độ (Copy chính xác số liệu từ các cột D-O ở ma trận xuống).

            **3. ĐỀ KIỂM TRA**
            - Tiêu đề: ĐỀ KIỂM TRA ${exam_type === 'hk' ? 'CUỐI' : 'GIỮA'} HỌC KÌ ${semester} - MÔN ${subject.toUpperCase()} ${grade}
            - **Cấu trúc:** I. TRẮC NGHIỆM, II. TỰ LUẬN.
            - **Yêu cầu nội dung Tự Luận:** Phải có các câu hỏi nhỏ a), b), c) để phân loại học sinh (Ví dụ: a-Nhận biết, b-Thông hiểu, c-Vận dụng).
            - **Lưu ý:** Đáp án MCQ xuống dòng (A... <br> B...). Công thức toán dùng LaTeX $$...$$.

            **4. HƯỚNG DẪN CHẤM**
            - Đáp án và thang điểm chi tiết.
			
			**III. QUY ĐỊNH KỸ THUẬT (BẮT BUỘC):**
            1. **Định dạng:** Chỉ trả về mã **HTML Table** ('<table border="1">...</table>') cho các bảng.
            2. **Không dùng Markdown:** Tuyệt đối không dùng \`\`\`html\`\`\` hoặc |---| .
            3. **Xuống dòng (QUAN TRỌNG):**
               - Trong HTML, ký tự xuống dòng (\n) không có tác dụng. **BẮT BUỘC phải dùng thẻ '<br>'** để ngắt dòng.
               - Mỗi khi kết thúc một ý, một câu, hoặc một đáp án, phải chèn thẻ '<br>'.
            4. **Công thức Toán:** Sử dụng LaTeX chuẩn, bao quanh bởi dấu $$ (ví dụ: $$x^2 + \sqrt{5}$$). Không dùng MathML.
            5. **Định dạng Trắc nghiệm (MCQ):**
               - Cấu trúc bắt buộc: Nội dung câu hỏi '<br>' A. ... <br> B. ... <br> C. ... <br> D. ...
               - **Tuyệt đối không** viết các đáp án nối liền nhau trên cùng một dòng.
            6. **Định dạng Câu chùm (Đúng/Sai):**
               - Nội dung lệnh hỏi <br>
               - a) Nội dung ý a... <br>
               - b) Nội dung ý b... <br>
               - c) Nội dung ý c... <br>
               - d) Nội dung ý d...
            7. **Khoảng cách giữa các câu:** Giữa Câu 1 và Câu 2 (và các câu tiếp theo) phải có thêm một thẻ '<br>' hoặc dùng thẻ '<p>' bao quanh từng câu để tạo khoảng cách rõ ràng, dễ đọc.
             
            ### TÀI LIỆU THAM KHẢO:
            ${DOCUMENT_CONTENT_7991}

           ## YÊU CẦU KIỂM SOÁT (STRICT):
            1. **Đúng Bộ Sách:** Chỉ dùng nội dung sách ${book_series}.
            2. **Đúng Lớp:** Chỉ dùng kiến thức lớp ${grade}.
            3. **Không bịa đặt:** Chỉ ra đề trong phạm vi các bài học đã cung cấp.
            4. **Đúng Số Liệu:** Cột 19 phải copy đúng con số KPI đã cho.
            `;

            // --- 6. GỌI API ---
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

            // --- 7. STREAM RESPONSE ---
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

// --- BIẾN DOCUMENT_CONTENT_7991 (NỘI DUNG GỐC) ---
const DOCUMENT_CONTENT_7991 = `
BỘ GIÁO DỤC VÀ ĐÀO TẠO
CỘNG HOÀ XÃ HỘI CHỦ NGHĨA VIỆT NAM

Độc lập - Tự do - Hạnh phúc

Số: 7991/BGDĐT-GDTrH
V/v thực hiện kiểm tra, đánh giá đối với cấp THCS, THPT
Hà Nội, ngày 17 tháng 12 năm 2024

Kính gửi: Các Sở Giáo dục và Đào tạo

Để thực hiện việc kiểm tra, đánh giá theo quy định tại Thông tư số 22/2021/TT-BGDĐT ngày 20/7/2021 quy định về đánh giá học sinh trung học cơ sở và học sinh trung học phổ thông của Bộ trưởng Bộ Giáo dục và Đào tạo (GDĐT), Bộ GDĐT đề nghị các Sở GDĐT căn cứ nội dung đã được tập huấn cho giáo viên cốt cán vào tháng 11/2024(1), tổ chức tập huấn cho cán bộ quản lí, giáo viên của các cơ sở giáo dục có thực hiện chương trình giáo dục phổ thông trên địa bàn quản lí.

Đối với các môn học đánh giá bằng nhận xét kết hợp đánh giá bằng điểm số, Sở GDĐT hướng dẫn các cơ sở giáo dục ở cấp trung học phổ thông xây dựng ma trận, bản đặc tả, đề kiểm tra và hướng dẫn chấm đề kiểm tra định kì bảo đảm các yêu cầu về chuyên môn, kĩ thuật (tham khảo Phụ lục kèm theo); trong năm học 2024-2025 triển khai thực hiện từ học kì 2.

Trong quá trình thực hiện, nếu có vướng mắc, đề nghị Sở GDĐT phản ánh về Bộ GDĐT (qua Vụ Giáo dục Trung học).

Nơi nhận

Như trên;

Bộ trưởng (để báo cáo);

TT. Phạm Ngọc Thưởng (để báo cáo);

Vụ trưởng (để báo cáo);

Lưu: VT, Vụ GDTrH.

TL. BỘ TRƯỞNG
KT. VỤ TRƯỞNG VỤ GIÁO DỤC TRUNG HỌC
PHÓ VỤ TRƯỞNG

(đã ký)
Đỗ Đức Quế

(1) Công văn số 6569/BGDĐT-GDTrH ngày 16/10/2024 về việc tập huấn giáo viên cốt cán về tăng cường năng lực thực hiện CT GDPT 2018 của Bộ GDĐT.

📎 PHỤ LỤC

(Kèm theo Công văn số 7991/BGDĐT-GDTrH ngày 17/12/2024 của Bộ GDĐT)
1. MA TRẬN ĐỀ KIỂM TRA ĐỊNH KÌ
| TT | Chủ đề/Chương | Nội dung/ĐV kiến thức | TNKQ – Nhiều lựa chọn | TNKQ – Đúng/Sai | TNKQ – Trả lời ngắn | Tự luận | Tổng | Tỉ lệ % |
|----|----------------|------------------------|------------------------|------------------|----------------------|----------|--------|----------|
| 1 | Chủ đề 1 | | Biết / Hiểu / VD | Biết / Hiểu / VD | Biết / Hiểu / VD | Biết / Hiểu / VD | (n) |    |
| 2 | Chủ đề 2 | | | | | | | |
| … | Chủ đề … | | | | | | | |

**Tổng số câu:**  
**Tổng số điểm:** 3.0 – 2.0 – 2.0 – 3.0 – 4.0 – 3.0 – 3.0  
**Tỉ lệ %:** 30 – 20 – 20 – 30 – 40 – 30 – 30
Ghi chú

(2) Mỗi câu hỏi Đúng – Sai gồm 4 ý nhỏ.

(3) Nếu môn không dùng dạng “Trả lời ngắn” → chuyển điểm sang Đúng – Sai.

(4) “n” = số câu.

(5) Phân phối điểm để đạt tỉ lệ khoảng 30%.
2. BẢN ĐẶC TẢ ĐỀ KIỂM TRA ĐỊNH KÌ
| TT | Chủ đề/Chương | Đơn vị kiến thức | Yêu cầu cần đạt | Số câu TNKQ | Số câu tự luận |
|----|----------------|------------------|------------------|--------------|-----------------|
| 1 | Chủ đề 1 | - Biết…  |  | (n) / NL? |  |
|   |              | - Hiểu… |  |            |  |
|   |              | - Vận dụng… | |            |  |
| 2 | Chủ đề 2 | - Biết… | | | |
| … | Chủ đề … | | | | |

**Tổng số câu:**  
**Tổng số điểm:** 3.0 – 2.0 – 2.0 – 3.0  
**Tỉ lệ %:** 30 – 20 – 20 – 30
Ghi chú

(6) “NL” là ghi tắt tên năng lực theo chương trình môn học.
`;






