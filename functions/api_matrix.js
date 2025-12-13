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
            const { 
                license_key, topics, subject, grade, semester, 
                exam_type, time, use_short_answer, 
                totalPeriodsHalf1, totalPeriodsHalf2,
                book_series 
            } = body;
            
            if (env.TEST_TOOL && license_key) { 
                const creditStr = await env.TEST_TOOL.get(license_key); 
                if (!creditStr || parseInt(creditStr) <= 0) {
                    return new Response(JSON.stringify({ error: "License hết hạn!" }), { status: 403, headers: corsHeaders });
                }
            }

            // --- 2. XỬ LÝ MÔ TẢ CHỦ ĐỀ & TỔNG HỢP THỜI LƯỢNG ---
            let topicsDescription = "";
            topics.forEach((topic, index) => {
                topicsDescription += `\nCHƯƠNG ${index + 1}: ${topic.name}\n`;
                topic.units.forEach((unit, uIndex) => {
                    let periodInfo = "";
                    let weightNote = "";
                    if (exam_type === 'hk') {
                        if (unit.p2 > 0) {
                             periodInfo = ` [Thời lượng: ${unit.p2} tiết (Nửa sau HK - TRỌNG TÂM 75%)]`;
                             weightNote = " (Ưu tiên số lượng câu hỏi)";
                        } else {
                             periodInfo = ` [Thời lượng: ${unit.p1} tiết (Nửa đầu HK - ÔN TẬP 25%)]`;
                             weightNote = " (Giảm số lượng câu hỏi)";
                        }
                    } else {
                        periodInfo = ` [Thời lượng: ${unit.p1} tiết]`;
                    }
                    topicsDescription += `   - Bài ${uIndex + 1}: ${unit.content}${periodInfo}${weightNote}\n`;
                });
            });

            // --- BỔ SUNG BIẾN TỔNG SỐ TIẾT (CHECKSUM) VÀO INPUT ---
            // Đây là phần bổ sung quan trọng để AI có mẫu số chính xác
            topicsDescription += `\n------------------------------------------------`;
            if (exam_type === 'hk') {
                topicsDescription += `\n**TỔNG HỢP THỜI LƯỢNG (DỮ LIỆU GỐC ĐỂ TÍNH TOÁN CỘT 19):**`;
                topicsDescription += `\n1. Tổng số tiết Nửa đầu HK (Mẫu số 1): **${totalPeriodsHalf1} tiết**`;
                topicsDescription += `\n2. Tổng số tiết Nửa sau HK (Mẫu số 2): **${totalPeriodsHalf2} tiết**`;
                topicsDescription += `\n(LƯU Ý QUAN TRỌNG: Khi tính % cho bài học, hãy lấy số tiết của bài đó chia cho Mẫu số tương ứng ở trên).`;
            } else {
                topicsDescription += `\n**TỔNG HỢP THỜI LƯỢNG:**`;
                topicsDescription += `\n- Tổng số tiết toàn bộ nội dung (Mẫu số chung): **${totalPeriodsHalf1} tiết**`;
            }
            topicsDescription += `\n------------------------------------------------\n`;
           
            // --- 3. CẤU TRÚC ĐỀ THI ---
            let structurePrompt = "";
            let scoreCoefficientInstruction = "";
            
            if (use_short_answer) {
                structurePrompt = `
                CẤU TRÚC ĐỀ THI (3 PHẦN):
                - Phần I: Trắc nghiệm MCQ (4 chọn 1).
                - Phần II: Trắc nghiệm Đúng/Sai (Mỗi câu 4 ý a,b,c,d).
                - Phần III: Trắc nghiệm Trả lời ngắn (Điền đáp số/kết quả).
                `;
                scoreCoefficientInstruction = `
                **HỆ SỐ ĐIỂM (Variable):** MCQ=0.25; TLN=0.5; Đ/S=1.0 (trung bình); Tự luận=Tùy ý.
                `;
            } else {
                structurePrompt = `
                CẤU TRÚC ĐỀ THI (2 PHẦN):
                - Phần I: Trắc nghiệm khách quan (4 lựa chọn).
                - Phần II: Tự luận (Giải chi tiết).
                *** CẤM: KHÔNG SOẠN TRẢ LỜI NGẮN ***
                `;
                scoreCoefficientInstruction = `
                **HỆ SỐ ĐIỂM (Variable):** MCQ=0.25; Tự luận=Tùy ý.
                `;
            }

            // --- 4. LOGIC TÍNH TOÁN TỈ LỆ (CẬP NHẬT THAM CHIẾU MẪU SỐ) ---
            let col19Logic = "";
            let scoreLogic = "";
            
            if (exam_type === 'hk') {
                scoreLogic = `*LƯU Ý PHÂN BỐ ĐIỂM (CUỐI KÌ): Kiến thức Nửa đầu ~25%, Kiến thức Nửa sau ~75%.`;
                col19Logic = `
                **CÔNG THỨC CỘT 19 (TỈ LỆ %):**
                - Nếu bài thuộc Nửa đầu HK: % = (Số tiết bài / ${totalPeriodsHalf1}) * 25
                - Nếu bài thuộc Nửa sau HK: % = (Số tiết bài / ${totalPeriodsHalf2}) * 75
                *(Lưu ý: ${totalPeriodsHalf1} và ${totalPeriodsHalf2} là các con số Tổng hợp thời lượng đã cung cấp ở trên)*.
                `;
            } else {
                scoreLogic = `*LƯU Ý PHÂN BỐ ĐIỂM (GIỮA KÌ): Tỷ lệ thuận với số tiết.`;
                col19Logic = `
                **CÔNG THỨC CỘT 19 (TỈ LỆ %):**
                - % = (Số tiết bài / ${totalPeriodsHalf1}) * 100
                `;
            }

            const prompt = `
            Bạn là một trợ lý chuyên gia khảo thí hàng đầu. Nhiệm vụ: Xây dựng Ma trận chính xác tuyệt đối.

            ### BƯỚC 1: DỮ LIỆU ĐẦU VÀO
            1. Môn: ${subject} - Lớp ${grade} - Bộ sách: **${book_series}**.
            2. Kỳ thi: ${exam_type === 'hk' ? 'Cuối học kì' : 'Giữa học kì'} ${semester} - Thời gian: ${time} phút.
            3. Cấu trúc: ${structurePrompt}
            4. Nội dung & Thời lượng chi tiết: 
            ${topicsDescription}
            
            ### BƯỚC 2: LOGIC TÍNH TOÁN SỐ LIỆU (BẮT BUỘC TUÂN THỦ)
            **A. QUOTA SỐ LƯỢNG CÂU HỎI (Dựa trên thời gian ${time} phút):**
            * Nếu >= 60 phút: 12 MCQ + 2 Đúng/Sai + (4 TLN + 1 Tự luận HOẶC 3 Tự luận).
            * Nếu <= 45 phút: 6 MCQ + 1 Đúng/Sai + (4 TLN + 1 Tự luận HOẶC 2 Tự luận).

            **B. CÔNG THỨC CỘT 19 (QUAN TRỌNG):**
            ${col19Logic}

            **C. QUY TẮC RẢI MỨC ĐỘ (BẮT BUỘC - KHÔNG ĐƯỢC VI PHẠM):**
            Yêu cầu bắt buộc là **MỌI LOẠI CÂU HỎI** đều phải xuất hiện ở **CẢ 3 MỨC ĐỘ** (Biết - Hiểu - Vận dụng).
            
            1. **Đối với TỰ LUẬN (Quan trọng nhất):**
               - **BẮT BUỘC** phải có ý hỏi mức **NHẬN BIẾT** (Ví dụ: Nêu khái niệm, phát biểu định lý...).
               - **BẮT BUỘC** phải có ý hỏi mức **THÔNG HIỂU** (Ví dụ: Giải thích, so sánh đơn giản...).
               - **BẮT BUỘC** phải có ý hỏi mức **VẬN DỤNG** (Ví dụ: Giải bài tập, liên hệ thực tế...).
               *Lưu ý: Nếu số lượng câu Tự luận ít, hãy chia câu đó thành các ý nhỏ a), b), c) tương ứng với các mức độ Biết/Hiểu/Vận dụng.*

            2. **Đối với TRẮC NGHIỆM (MCQ, Đúng/Sai, TLN):**
               - Không được dồn hết vào mức Biết. Phải có cả các câu hỏi yêu cầu tư duy (Hiểu/Vận dụng).

            3. **Nguyên tắc Phủ kín:** Tất cả các bài học đều phải có câu hỏi.

            ### BƯỚC 3: XUẤT DỮ LIỆU ĐẦU RA (HTML OUTPUT)
            
            **1. MA TRẬN ĐỀ KIỂM TRA ĐỊNH KÌ**
            *Logic tính toán Footer:*
            - **Dòng "Tổng số câu":** Cộng dọc tất cả các con số trong cột tương ứng.
            - **Dòng "Tổng điểm":** Tính tổng điểm dựa trên số câu và hệ số điểm (${scoreCoefficientInstruction}).
              + Ô Cột 16 (Điểm Biết) = (Số câu MCQ Biết * 0.25) + ... + (Điểm TL Biết).
              + Ô Cột 17 (Điểm Hiểu) = (Số câu MCQ Hiểu * 0.25) + ...
              + Ô Cột 18 (Điểm VD) = (Số câu MCQ VD * 0.25) + ...
              => Tổng 3 ô này phải bằng 10.0.
            - **Dòng "Tỉ lệ %":** Quy đổi điểm ra %. (Điểm * 10).

            *Copy chính xác cấu trúc Header sau và điền dữ liệu:*
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
                        <th>(=Tổng tất cả câu Biết)</th>
                        <th>(=Tổng tất cả câu Hiểu)</th>
                        <th>(=Tổng tất cả câu VD)</th>
                        <th></th>
                    </tr>
                     <tr>
                        <th colspan="3">Tổng điểm</th>
                        <th colspan="3">3.0</th>
                        <th colspan="3">2.0 (hoặc 4.0)</th>
                        <th colspan="3">2.0 (hoặc 0)</th>
                        <th colspan="3">3.0 (hoặc 3.0)</th>
                        <th>(=Tính tổng điểm Biết)</th>
                        <th>(=Tính tổng điểm Hiểu)</th>
                        <th>(=Tính tổng điểm VD)</th>
						<th>10.0</th>
                    </tr>
                    <tr>
                        <th colspan="3">Tỉ lệ %</th>
                        <th colspan="3">30%</th>
                        <th colspan="3">20% (hoặc 40%)</th>
                        <th colspan="3">20% (hoặc 0%)</th>
                        <th colspan="3">30%</th>
                        <th>(=Điểm Biết * 10)%</th>
                        <th>(=Điểm Hiểu * 10)%</th>
                        <th>(=Điểm VD * 10)%</th>
                        <th>100%</th>
                    </tr>
                </tfoot>
            </table>
            \`\`\`

            **2. BẢN ĐẶC TẢ ĐỀ KIỂM TRA**
            (Tạo bảng HTML 16 cột. Cột "Yêu cầu cần đạt" mô tả chi tiết Biết/Hiểu/Vận dụng cho từng đơn vị kiến thức).

            **3. ĐỀ KIỂM TRA**
            - Tiêu đề: ĐỀ KIỂM TRA ${exam_type === 'hk' ? 'CUỐI' : 'GIỮA'} HỌC KÌ ${semester} - MÔN ${subject.toUpperCase()} ${grade}
            - **Cấu trúc:** I. TRẮC NGHIỆM, II. TỰ LUẬN.
            - **Yêu cầu nội dung Tự Luận:** Phải có các câu hỏi nhỏ a), b), c) để phân loại học sinh (Ví dụ: a-Nhận biết, b-Thông hiểu, c-Vận dụng).
            - **Lưu ý:** Đáp án MCQ xuống dòng (A... <br> B...). Công thức toán dùng LaTeX $$...$$.

            **4. HƯỚNG DẪN CHẤM**
            - Đáp án và thang điểm chi tiết.

            ### TÀI LIỆU THAM KHẢO:
            ${DOCUMENT_CONTENT_7991}

           ## YÊU CẦU KIỂM SOÁT (STRICT):
            1. **Đúng Bộ Sách:** Chỉ dùng nội dung sách ${book_series}.
            2. **Đúng Lớp:** Chỉ dùng kiến thức lớp ${grade}.
            3. **Không bịa đặt:** Chỉ ra đề trong phạm vi các bài học đã cung cấp.
            4. **Đúng Công Thức:** Cột 19 phải tính đúng theo công thức.
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
(Giữ nguyên nội dung văn bản pháp lý 7991...)
`;
