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

            let topicsDescription = "";
            topics.forEach((topic, index) => {
                topicsDescription += `\nCHƯƠNG ${index + 1}: ${topic.name}\n`;
                topic.units.forEach((unit, uIndex) => {
                    let periodInfo = "";
                    let weightNote = "";
                    if (exam_type === 'hk') {
                        if (unit.p2 > 0) {
                             periodInfo = ` [Thời lượng: ${unit.p2} tiết (Nửa sau HK - TRỌNG TÂM 75%)]`;
                             weightNote = " (Ưu tiên ra nhiều câu hỏi)";
                        } else {
                             periodInfo = ` [Thời lượng: ${unit.p1} tiết (Nửa đầu HK - ÔN TẬP 25%)]`;
                             weightNote = " (Ra ít câu hỏi)";
                        }
                    } else {
                        periodInfo = ` [Thời lượng: ${unit.p1} tiết]`;
                    }
                    topicsDescription += `   - Bài ${uIndex + 1}: ${unit.content}${periodInfo}${weightNote}\n`;
                });
            });
           
            let structurePrompt = "";
            let scoreCoefficientInstruction = "";
            
            if (use_short_answer) {
                structurePrompt = `
                CẤU TRÚC ĐỀ THI (3 PHẦN):
                - Phần I: Trắc nghiệm nhiều lựa chọn (4 phương án chọn 1).
                - Phần II: Trắc nghiệm Đúng/Sai (Mỗi câu có 4 ý a,b,c,d).
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

            let scoreLogic = "";
            let col19Logic = "";
            
            if (exam_type === 'hk') {
                scoreLogic = `*LƯU Ý PHÂN BỐ ĐIỂM (CUỐI KÌ): Kiến thức Nửa đầu ~25%, Kiến thức Nửa sau ~75%.`;
                col19Logic = `
                **CÔNG THỨC CỘT 19 (TỈ LỆ %):**
                - Bài Nửa đầu HK: % = (Số tiết bài / ${totalPeriodsHalf1}) * 25
                - Bài Nửa sau HK: % = (Số tiết bài / ${totalPeriodsHalf2}) * 75
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
            4. Nội dung: ${topicsDescription}
            
            ### BƯỚC 2: LOGIC TÍNH TOÁN SỐ LIỆU (BẮT BUỘC TUÂN THỦ)
            **A. QUOTA SỐ LƯỢNG CÂU HỎI (Dựa trên thời gian ${time} phút):**
            * Nếu >= 60 phút: 12 MCQ + 2 Đúng/Sai + (4 TLN + 1 Tự luận HOẶC 3 Tự luận).
            * Nếu <= 45 phút: 6 MCQ + 1 Đúng/Sai + (4 TLN + 1 Tự luận HOẶC 2 Tự luận).

            **B. CÔNG THỨC CỘT 19 (QUAN TRỌNG):**
            ${col19Logic}

            **C. QUY TẮC ĐIỀN:** Phủ kín bài học, Rải đều mức độ (Biết/Hiểu/VD). TUYỆT ĐỐI KHÔNG để trống cột Vận dụng.

            ### BƯỚC 3: XUẤT DỮ LIỆU ĐẦU RA (HTML OUTPUT)
            
            **1. MA TRẬN ĐỀ KIỂM TRA ĐỊNH KÌ**
            *Logic tính toán Footer (CỘT 16, 17, 18, 19):*
            - **Dòng "Tổng số câu":** Cộng dọc tất cả các con số trong cột tương ứng (Ví dụ: Cột 16 là Tổng số câu Biết của tất cả các phần).
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
            *Tạo bảng HTML có 16 cột:*
            * Cột 1-3: Giống phần Ma trận.
            * Cột 4: **Yêu cầu cần đạt** (Mô tả chi tiết kiến thức/kỹ năng cần kiểm tra cho từng mức độ Biết/Hiểu/Vận dụng, mỗi ý xuống dòng bằng thẻ '<br>').
            * Cột 5-16: Số câu hỏi ở các mức độ (Copy chính xác số liệu từ các cột D-O ở ma trận xuống).

            **3. ĐỀ KIỂM TRA**
            - Tiêu đề: ĐỀ KIỂM TRA ${exam_type === 'hk' ? 'CUỐI' : 'GIỮA'} HỌC KÌ ${semester} - MÔN ${subject.toUpperCase()} ${grade}
            - **Cấu trúc:** I. TRẮC NGHIỆM, II. TỰ LUẬN.
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
