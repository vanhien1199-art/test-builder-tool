// File: functions/api_matrix.js
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

            const MODEL_NAME = "gemini-2.0-flash";
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
                    if (exam_type === 'hk') {
                        periodInfo = ` [Thời lượng: ${unit.p1} tiết (Nửa đầu), ${unit.p2} tiết (Nửa sau)]`;
                    } else {
                        periodInfo = ` [Thời lượng: ${unit.p1} tiết]`;
                    }
                    topicsDescription += `   - Bài ${uIndex + 1}: ${unit.content}${periodInfo}\n`;
                });
            });
           
            // --- 3. XÂY DỰNG CẤU TRÚC ĐỀ THI DỰA TRÊN LỰA CHỌN (FIX LỖI) ---
            let structurePrompt = "";
            
            if (use_short_answer) {
                // Cấu trúc mới 2025 (Có trả lời ngắn)
                structurePrompt = `
                CẤU TRÚC ĐỀ THI (3 PHẦN):
                - Phần I: Trắc nghiệm nhiều lựa chọn (4 phương án chọn 1).
                - Phần II: Trắc nghiệm Đúng/Sai (Mỗi câu có 4 ý a,b,c,d).
                - Phần III: Câu hỏi Trả lời ngắn (Điền đáp số/kết quả).
                `;
            } else {
                // Cấu trúc truyền thống (Không có trả lời ngắn)
                structurePrompt = `
                CẤU TRÚC ĐỀ THI (2 PHẦN):
                - Phần I: Trắc nghiệm khách quan (4 lựa chọn).
                - Phần II: Tự luận (Giải chi tiết).
                *** YÊU CẦU ĐẶC BIỆT: TUYỆT ĐỐI KHÔNG SOẠN CÂU HỎI DẠNG "TRẢ LỜI NGẮN" HAY "ĐIỀN ĐÁP SỐ". CHỈ DÙNG TRẮC NGHIỆM VÀ TỰ LUẬN. ***
                `;
            }

            // --- 4. LOGIC PHÂN BỐ ĐIỂM ---
            let scoreLogic = "";
            if (exam_type === 'hk') {
                scoreLogic = `*LƯU Ý PHÂN BỐ ĐIỂM (CUỐI KÌ): Tổng tiết Nửa đầu HK: ${totalPeriodsHalf1}, Nửa sau HK: ${totalPeriodsHalf2}. Phân bổ điểm tỷ lệ thuận với thời lượng.`;
            } else {
                scoreLogic = `*LƯU Ý PHÂN BỐ ĐIỂM (GIỮA KÌ): Tổng số tiết: ${totalPeriodsHalf1}. Tính % điểm dựa trên số tiết từng bài.`;
            }

            // --- PROMPT FINAL ---
            const prompt = `
            Bạn là một trợ lý chuyên về xây dựng ma trận đề kiểm tra và đề kiểm tra theo quy định của Bộ Giáo dục và Đào tạo Việt Nam. Dựa trên Công văn số 7991/BGDĐT-GDTrH ngày 17/12/2024 và các hướng dẫn trong Phụ lục kèm theo. Bạn am hiểu sâu sắc chương trình giáo dục phổ thông 2018 (Ban hành kèm theo Thông tư số 32/2018/TT-BGDĐT ngày 26 tháng 12 năm 2018 của Bộ trưởng Bộ Giáo dục và Đào tạo).
            Bạn hiểu biết chuyên sâu về sách giáo khoa ${book_series} lớp 6, lớp 7, lớp 8, lớp 9, lớp 10, lớp 11, lớp 12 tham khảo tại địa chỉ "https://taphuan.nxbgd.vn/#/".
            Nhiệm vụ của bạn là xây dựng ma trận đề kiểm tra, bản đặc tả đề kiểm tra, đề kiểm tra và hướng dẫn chấm theo các yêu cầu dưới đây. KHÔNG thêm bất kỳ lời giải thích nào.
           
            ## THÔNG TIN
           1. Môn: ${subject} - Lớp ${grade}
            2. Bộ sách: **${book_series}** (Dùng đúng thuật ngữ sách này).
            3. Kỳ thi: ${exam_type === 'hk' ? 'Cuối học kì' : 'Giữa học kì'} ${semester}.
            4. Thời gian: ${time} phút.

            ${structurePrompt}

            ## NỘI DUNG & THỜI LƯỢNG:
            ${topicsDescription}
            
            ${scoreLogic}
          ## KẾT QUẢ ĐẦU RA: TUÂN THỦ NGIÊM NGẶT CÁC YÊU CẦU SAU:

**I. QUY ĐỊNH VỀ ĐIỂM SỐ VÀ TÍNH TOÁN (QUAN TRỌNG - THỰC HIỆN TRƯỚC):**
*Mục tiêu: Đảm bảo TỔNG ĐIỂM TOÀN BÀI LUÔN LÀ 10.0.*

1. **Phân bổ tỉ lệ điểm theo nội dung kiến thức:**
   - **Đề giữa kỳ:** Tỉ lệ điểm của mỗi đơn vị = (Số tiết của đơn vị / Tổng số tiết toàn bộ nội dung) * 100%.
   - **Đề học kỳ:**
     - Nửa đầu học kỳ (25% điểm): Tỉ lệ điểm đơn vị = (Số tiết đơn vị * 0.25) / Tổng tiết nửa đầu.
     - Nửa sau học kỳ (75% điểm): Tỉ lệ điểm đơn vị = (Số tiết đơn vị * 0.75) / Tổng tiết nửa sau.
   - *Lưu ý:* Tổng tỉ lệ % điểm của tất cả các đơn vị cộng lại phải bằng 100%.

2. **Cấu trúc điểm theo dạng câu hỏi (Cố định):**
   - **Phần I (Trắc nghiệm nhiều lựa chọn):** 3.0 điểm (30%).
   - **Phần II (Trắc nghiệm Đúng-Sai):** 2.0 điểm (20%).
   - **Phần III (Trắc nghiệm Trả lời ngắn):** 2.0 điểm (20%).
   - **Phần IV (Tự luận):** 3.0 điểm (30%).
   - *Tổng cộng:* TNKQ (7.0 điểm) + Tự luận (3.0 điểm) = 10.0 điểm.

3. **Cấu trúc điểm theo mức độ nhận thức (Linh hoạt):**
   - **Biết:** ~40% (4.0 điểm).
   - **Hiểu:** ~30% (3.0 điểm).
   - **Vận dụng:** ~30% (3.0 điểm).
   - *Yêu cầu:* Mỗi đơn vị kiến thức phải có ít nhất 20% điểm ở mức Vận dụng.

4. **Quy đổi số lượng câu hỏi (Dựa trên thời lượng ${time} phút):**
   - **MCQ (0.25đ/câu):** Cần 3.0 điểm => 12 câu.
   - **Đúng-Sai (1.0đ/câu chùm):** Cần 2.0 điểm => 2 câu chùm (mỗi câu chùm 4 ý).
   - **Trả lời ngắn (0.5đ/câu):** Cần 2.0 điểm => 4 câu.
   - **Tự luận:** Cần 3.0 điểm => 2-3 câu (phân phối điểm linh hoạt, ví dụ: 1.5đ + 1.0đ + 0.5đ).
   - *Tổng số câu:* Điều chỉnh phù hợp với thời gian làm bài (45/60/90 phút) nhưng phải giữ đúng tổng điểm từng phần.

**II. YÊU CẦU VỀ ĐỊNH DẠNG VÀ CẤU TRÚC BẢNG (BẮT BUỘC):**

**A. PHẦN I – MA TRẬN ĐỀ KIỂM TRA ĐỊNH KÌ**
*Tạo bảng HTML có đúng 19 cột. Cấu trúc cụ thể:*

* **HEADER (Dòng 1-4):**
    * **Dòng 1:**
        * Cột 1 (A): 'rowspan="4"': **TT**
        * Cột 2 (B): 'rowspan="4"': **Chủ đề/Chương**
        * Cột 3 (C): 'rowspan="4"': **Nội dung/đơn vị kiến thức**
        * Cột 4-15 (D-O): 'colspan="12"': **Mức độ đánh giá**
        * Cột 16-18 (P-R): 'colspan="3"': **Tổng số câu**
        * Cột 19 (S): 'rowspan="4"': **Tỉ lệ % điểm**
    * **Dòng 2:**
        * Cột 4-12 (D-L): 'colspan="9"': **TNKQ**
        * Cột 13-15 (M-O): 'colspan="3"': **Tự luận**
    * **Dòng 3:**
        * Cột 4-6 (D-F): 'colspan="3"': **Nhiều lựa chọn**
        * Cột 7-9 (G-I): 'colspan="3"': **Đúng - Sai**
        * Cột 10-12 (J-L): 'colspan="3"': **Trả lời ngắn**
        * Cột 13-15 (M-O): 'colspan="3"': **Tự luận**
    * **Dòng 4:**
        * Các cột con (Biết, Hiểu, Vận dụng) tương ứng cho từng nhóm ở dòng 3.
        * Cột 16 (P): **Biết**, Cột 17 (Q): **Hiểu**, Cột 18 (R): **Vận dụng**.

B. PHẦN II – HƯỚNG DẪN ĐIỀN VÀ TÍNH TOÁN DỮ LIỆU TRONG BẢNG MA TRẬN
BODY (Dữ liệu cho từng đơn vị kiến thức):
Cột TT, Chủ đề, Nội dung: Điền thông tin đơn vị kiến thức.
Cột Biết/Hiểu/Vận dụng cho từng dạng câu (MCQ, Đ-S, TLN, TL): Điền số lượng câu hỏi đã được phân bổ ở Bước 4.
Cột Tổng số câu (P, Q, R): Hệ thống TỰ ĐỘNG TÍNH tổng số câu theo từng mức độ (Biết, Hiểu, Vận dụng) cho hàng đó.
Cột Tỉ lệ % điểm (S): Ghi chính xác tỉ lệ phần trăm điểm đã tính ở Bước 1 cho đơn vị kiến thức đó.
FOOTER (Dòng TỔNG KẾT - THỰC HIỆN TÍNH TOÁN SAU KHI ĐIỀN HẾT BODY):
Dòng "Tổng số câu":
Cột 4-15 (D-O): Cộng dọc tất cả số câu đã điền ở các hàng trong Body, để ra tổng số câu cho từng ô nhỏ (VD: MCQ-Biết, Đ-S-Hiểu...).
Cột 16-18 (P-R): Cộng dọc các giá trị "Tổng số câu" của từng hàng, ra tổng số câu toàn bài theo mức độ.
KIỂM TRA: Tổng số câu các phần (MCQ, Đ-S, TLN, TL) phải khớp với số lượng đã quy đổi ở Bước 3.
Dòng "Tổng số điểm": Lưu ý: Các công thức dưới đây PHẢI được tính toán tự động dựa trên "Tổng số câu" vừa tính ở trên.
Ô A-C (gộp): Ghi chữ "Tổng số điểm".
Ô D-F (gộp, cho phần MCQ): Tính = (Tổng số câu MCQ) * 0.25. Kết quả PHẢI là 3.0.
Ô G-I (gộp, cho phần Đúng-Sai): Tính = (Tổng số câu dạng Đ-S) * 1.0. Kết quả PHẢI là 2.0. (Lưu ý: 1 "câu" Đ-S là 1 chùm 4 ý, tính là 1 câu).
Ô J-L (gộp, cho phần Trả lời ngắn): Tính = (Tổng số câu TLN) * 0.5. Kết quả PHẢI là 2.0.
Ô M-O (gộp, cho phần Tự luận): Tính = Tổng điểm của tất cả câu Tự luận. Kết quả PHẢI là 3.0. (Điểm mỗi câu TL đã được xác định khi phân bổ ở Bước 4).
Ô P (Tổng điểm mức Biết): Tính = (Tổng câu MCQ-Biết * 0.25) + (Tổng câu Đ-S-Biết * 1.0) + (Tổng câu TLN-Biết * 0.5) + (Tổng điểm TL-Biết).
Ô Q (Tổng điểm mức Hiểu): Tính tương tự như ô P, cho các câu ở mức Hiểu.
Ô R (Tổng điểm mức Vận dụng): Tính tương tự như ô P, cho các câu ở mức Vận dụng.
Ô S: Ghi 10.0.
Dòng "Tỉ lệ %":
Cấu trúc gộp ô giống hệt dòng "Tổng số điểm".
Chuyển đổi giá trị điểm ở dòng trên thành tỉ lệ phần trăm so với tổng điểm 10.
Ô D-F (gộp): (Điểm MCQ / 10) * 100% = 30%.
Ô G-I (gộp): 20%.
Ô J-L (gộp): 20%.
Ô M-O (gộp): 30%.
Ô P: (Điểm mức Biết / 10) * 100% (VD: ~40%).
Ô Q: (Điểm mức Hiểu / 10) * 100% (VD: ~30%).
Ô R: (Điểm mức Vận dụng / 10) * 100% (VD: ~30%).
Ô S: 100%.
**B. PHẦN II – BẢN ĐẶC TẢ ĐỀ KIỂM TRA**
*Tạo bảng HTML có 16 cột:*
* Cột 1-3: Giống phần Ma trận.
* Cột 4: **Yêu cầu cần đạt** (Mô tả chi tiết kiến thức/kỹ năng cần kiểm tra cho từng mức độ Biết/Hiểu/Vận dụng, mỗi ý xuống dòng bằng thẻ '<br>').
* Cột 5-16: Số câu hỏi ở các mức độ (tương ứng với các cột D-O ở ma trận).

**C. PHẦN III – ĐỀ KIỂM TRA & ĐÁP ÁN**
* **Đề bài:**
    * Phân chia rõ ràng 2 phần: **I. TRẮC NGHIỆM KHÁCH QUAN** (7.0đ) và **II. TỰ LUẬN** (3.0đ).
    * **Phần I:** Chia thành 3 tiểu mục: 
        * **Phần 1 (MCQ):** 12 câu.
        * **Phần 2 (Đúng-Sai):** 2 câu chùm (kẻ bảng 3 cột: Nội dung | Đúng | Sai cho học sinh tích).
        * **Phần 3 (Trả lời ngắn):** 4 câu.
    * **Phần II:** 2-3 câu tự luận, ghi rõ điểm số từng câu.
    * *Lưu ý:* Mỗi câu hỏi phải có mã ma trận (ví dụ: '(M1-B)' cho Mức 1 - Biết).
* **Đáp án & Hướng dẫn chấm:**
    * **Phần 1 (MCQ):** Kẻ bảng 2 dòng (Dòng 1: Số câu 1-12, Dòng 2: Đáp án A/B/C/D).
    * **Phần 2 (Đúng-Sai):** Kẻ bảng chi tiết cho từng câu chùm (4 ý a,b,c,d -> Đ/S).
    * **Phần 3 (Trả lời ngắn):** Liệt kê đáp án đúng.
    * **Tự luận:** Kẻ bảng 3 cột (Câu | Nội dung/Đáp án chi tiết | Điểm thành phần).

**III. QUY ĐỊNH KỸ THUẬT (BẮT BUỘC):**
1.  **Định dạng:** Chỉ trả về mã **HTML Table** ('<table border="1">...</table>').
2.  **Không dùng Markdown:** Tuyệt đối không dùng \html \ hoặc\|---|\.
3.  **Xuống dòng:** Sử dụng thẻ '<br>' thay cho dấu xuống dòng '\n'.
4.  **Công thức Toán:** Sử dụng LaTeX chuẩn, bao quanh bởi dấu $$ (ví dụ: $$x^2 + \sqrt{5}$$). Không dùng MathML.
5.  **Trắc nghiệm:** Các đáp án A, B, C, D phải nằm trên các dòng riêng biệt (dùng <br>).
    * Ví dụ: A. Đáp án A <br> B. Đáp án B...
6.  **Tính toán:** Hãy kiểm tra lại các phép cộng hàng dọc và hàng ngang trong ma trận để đảm bảo số liệu khớp 100%.
              `;

           // --- 3. GỌI GOOGLE API (FETCH) ---
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

            // --- 4. XỬ LÝ STREAM & TRẢ VỀ CLIENT ---
            // Chúng ta tạo một TransformStream để đọc dữ liệu SSE từ Google,
            // lọc lấy phần text và gửi về cho Client ngay lập tức.
            
            const { readable, writable } = new TransformStream();
            const writer = writable.getWriter();
            const encoder = new TextEncoder();
            const decoder = new TextDecoder();

            // Xử lý bất đồng bộ ở nền (Background processing)
            (async () => {
                const reader = response.body.getReader();
                let buffer = "";

                try {
                    while (true) {
                        const { done, value } = await reader.read();
                        if (done) break;

                        // Giải mã chunk và cộng vào buffer
                        const chunk = decoder.decode(value, { stream: true });
                        buffer += chunk;

                        // Tách các dòng dữ liệu (SSE format: "data: {...}")
                        const lines = buffer.split("\n");
                        buffer = lines.pop(); // Giữ lại phần cuối chưa trọn vẹn

                        for (const line of lines) {
                            if (line.startsWith("data: ")) {
                                const jsonStr = line.substring(6).trim();
                                if (jsonStr === "[DONE]") continue; // Kết thúc stream

                                try {
                                    const parsed = JSON.parse(jsonStr);
                                    // Trích xuất văn bản từ JSON của Google
                                    const textPart = parsed.candidates?.[0]?.content?.parts?.[0]?.text;
                                    if (textPart) {
                                        // Gửi văn bản sạch về cho Client
                                        await writer.write(encoder.encode(textPart));
                                    }
                                } catch (e) {
                                    // Bỏ qua các dòng không phải JSON (nếu có)
                                }
                            }
                        }
                    }
                    
                    // --- TRỪ TIỀN SAU KHI HOÀN TẤT ---
                    if (env.TEST_TOOL && license_key) {
                        const creditStr = await env.TEST_TOOL.get(license_key);
                        if (creditStr) {
                            let current = parseInt(creditStr);
                            if (current > 0) await env.TEST_TOOL.put(license_key, (current - 1).toString());
                        }
                    }

                } catch (err) {
                    // Gửi lỗi về Client nếu bị ngắt giữa chừng
                    await writer.write(encoder.encode(`\n\n[LỖI STREAM]: ${err.message}`));
                } finally {
                    await writer.close();
                }
            })();

            // Trả về Stream ngay lập tức
            return new Response(readable, {
                headers: {
                    ...corsHeaders,
                    "Content-Type": "text/html; charset=utf-8",
                    "Cache-Control": "no-cache",
                    "Connection": "keep-alive"
                }
            });

        } catch (error) {
            return new Response(JSON.stringify({ error: `Lỗi Server: ${error.message}` }), { status: 500, headers: corsHeaders });
        }
    }
}

