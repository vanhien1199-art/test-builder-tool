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
            
            // --- 1. CHECK LICENSE ---
            if (env.TEST_TOOL && license_key) { 
                const creditStr = await env.TEST_TOOL.get(license_key); 
                if (!creditStr || parseInt(creditStr) <= 0) {
                    return new Response(JSON.stringify({ error: "License không hợp lệ hoặc hết hạn!" }), { status: 403, headers: corsHeaders });
                }
            }

            // --- 2. XỬ LÝ MÔ TẢ CHỦ ĐỀ ---
            let topicsDescription = "";
            topics.forEach((topic, index) => {
                topicsDescription += `\nCHƯƠNG ${index + 1}: ${topic.name}\n`;
                topic.units.forEach((unit, uIndex) => {
                    let periodInfo = "";
                    let weightNote = "";
                    if (exam_type === 'hk') {
                        // Logic phân loại Nửa đầu / Nửa sau để áp dụng công thức
                        if (unit.p2 > 0) {
                             periodInfo = ` [Thời lượng: ${unit.p2} tiết (Thuộc Nửa sau HK)]`;
                             weightNote = " -> Áp dụng công thức nhóm 75%";
                        } else {
                             periodInfo = ` [Thời lượng: ${unit.p1} tiết (Thuộc Nửa đầu HK)]`;
                             weightNote = " -> Áp dụng công thức nhóm 25%";
                        }
                    } else {
                        periodInfo = ` [Thời lượng: ${unit.p1} tiết]`;
                    }
                    topicsDescription += `   - Bài ${uIndex + 1}: ${unit.content}${periodInfo}${weightNote}\n`;
                });
            });
           
            // --- 3. CẤU TRÚC & HỆ SỐ ĐIỂM ---
            let structurePrompt = "";
            if (use_short_answer) {
                structurePrompt = `
                CẤU TRÚC ĐỀ THI (3 PHẦN):
                - Phần I: Trắc nghiệm MCQ (4 chọn 1).
                - Phần II: Trắc nghiệm Đúng/Sai (Mỗi câu 4 ý).
                - Phần III: Trắc nghiệm Trả lời ngắn.
                `;
            } else {
                structurePrompt = `
                CẤU TRÚC ĐỀ THI (2 PHẦN):
                - Phần I: Trắc nghiệm MCQ.
                - Phần II: Tự luận.
                *** CẤM: KHÔNG SOẠN CÂU HỎI TRẢ LỜI NGẮN ***
                `;
            }

            // --- 4. LOGIC TÍNH TOÁN CỘT 19 (CỰC KỲ QUAN TRỌNG) ---
            let col19Logic = "";
            if (exam_type === 'hk') {
                // Công thức cho đề Cuối kỳ (25% - 75%)
                col19Logic = `
                **CÔNG THỨC TÍNH TOÁN CỘT 19 (TỈ LỆ % ĐIỂM) CHO TỪNG DÒNG:**
                Với mỗi dòng dữ liệu (bắt đầu từ dòng 5), bạn phải tính toán giá trị cột cuối cùng như sau:
                1. Nếu bài học thuộc **Nửa đầu HK**: 
                   % = (Số tiết của bài / ${totalPeriodsHalf1}) * 25
                2. Nếu bài học thuộc **Nửa sau HK**: 
                   % = (Số tiết của bài / ${totalPeriodsHalf2}) * 75
                *(Làm tròn kết quả đến 1 chữ số thập phân)*.
                `;
            } else {
                // Công thức cho đề Giữa kỳ (100%)
                col19Logic = `
                **CÔNG THỨC TÍNH TOÁN CỘT 19 (TỈ LỆ % ĐIỂM) CHO TỪNG DÒNG:**
                Với mỗi dòng dữ liệu (bắt đầu từ dòng 5):
                % = (Số tiết của bài / ${totalPeriodsHalf1}) * 100
                *(Làm tròn kết quả đến 1 chữ số thập phân)*.
                `;
            }

            // --- PROMPT FINAL ---
            const prompt = `
            Bạn là một trợ lý chuyên gia khảo thí hàng đầu. Nhiệm vụ: Xây dựng Ma trận, Đặc tả và Đề kiểm tra chính xác tuyệt đối.

            ### BƯỚC 1: DỮ LIỆU ĐẦU VÀO
            1. Môn: ${subject} - Lớp ${grade}
            2. Bộ sách: **${book_series}** (Chỉ dùng kiến thức sách này).
            3. Kỳ thi: ${exam_type === 'hk' ? 'Cuối học kì' : 'Giữa học kì'} ${semester}.
            4. Thời gian: ${time} phút.
            5. Cấu trúc: ${structurePrompt}
            6. Nội dung & Thời lượng:
            ${topicsDescription}
            
            ### BƯỚC 2: LOGIC TÍNH TOÁN SỐ LIỆU (BẮT BUỘC TUÂN THỦ)
            
            **A. QUOTA SỐ LƯỢNG CÂU HỎI (Dựa trên thời gian ${time} phút):**
            * Nếu >= 60 phút: 12 MCQ + 2 Đúng/Sai + (4 TLN + 1 Tự luận HOẶC 3 Tự luận).
            * Nếu <= 45 phút: 6 MCQ + 1 Đúng/Sai + (4 TLN + 1 Tự luận HOẶC 2 Tự luận).

            **B. CÔNG THỨC TÍNH TỈ LỆ % (CỘT 19):**
            ${col19Logic}
            -> Hãy áp dụng công thức này để điền số liệu vào cột cuối cùng của Ma trận.

            **C. QUY TẮC ĐIỀN MA TRẬN:**
            1. Phủ kín các bài học.
            2. Rải đều mức độ (Biết/Hiểu/Vận dụng). TUYỆT ĐỐI KHÔNG để trống cột Vận dụng.
            3. Kiểm tra tổng dọc: Phải khớp Quota.

            ### BƯỚC 3: XUẤT DỮ LIỆU ĐẦU RA (HTML OUTPUT)
            *Chỉ trả về mã HTML. Sử dụng thẻ <table> chuẩn.*

            **1. MA TRẬN ĐỀ KIỂM TRA ĐỊNH KÌ**
            *Copy chính xác cấu trúc Header sau và điền dữ liệu:*
            \`\`\`html
            <table border="1" style="border-collapse:collapse; width:100%; text-align:center;">
                <thead>
                    <tr>
                        <th rowspan="4">TT</th>
                        <th rowspan="4">Chủ đề/Chương</th>
                        <th rowspan="4">Nội dung/Đơn vị kiến thức</th>
                        <th colspan="12">Mức độ đánh giá</th>
                        <th colspan="3">Tổng</th>
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
                        <th>12 (hoặc 6)</th>
                        <th>2 (hoặc 1)</th>
                        <th>(Sum)</th>
                        <th></th>
                    </tr>
                     <tr>
                        <th colspan="3">Tổng điểm</th>
                        <th colspan="3">3.0</th>
                        <th colspan="3">2.0 (hoặc 4.0)</th>
                        <th colspan="3">2.0 (hoặc 0)</th>
                        <th colspan="3">3.0 (hoặc 3.0)</th>
                        <th>(= Tổng điểm Biết)</th>
                        <th>(= Tổng điểm Hiểu)</th>
                        <th>(= Tổng điểm VD)</th>
						<th>10.0</th>
                    </tr>
                    <tr>
                        <th colspan="3">Tỉ lệ %</th>
                        <th colspan="3">30%</th>
                        <th colspan="3">20% (hoặc 40%)</th>
                        <th colspan="3">20% (hoặc 0%)</th>
                        <th colspan="3">30%</th>
                        <th>(= % Biết)</th>
                        <th>(= % Hiểu)</th>
                        <th>(= % VD)</th>
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
            - **Lưu ý:** Đáp án MCQ xuống dòng từng câu (A... <br> B...). Công thức toán dùng LaTeX $$...$$.

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
            4. **Đúng Công Thức:** Cột 19 phải tính đúng theo công thức 25/75 (nếu là cuối kỳ).
            `;

            // --- 6. GỌI API & STREAMING ---
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

**Tổng số câu:** **Tổng số điểm:** 3.0 – 2.0 – 2.0 – 3.0 – 4.0 – 3.0 – 3.0  
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

**Tổng số câu:** **Tổng số điểm:** 3.0 – 2.0 – 2.0 – 3.0  
**Tỉ lệ %:** 30 – 20 – 20 – 30
Ghi chú

(6) “NL” là ghi tắt tên năng lực theo chương trình môn học.
`;
