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
            
            // Lấy thêm biến book_series
            const { 
                license_key, topics, subject, grade, semester, 
                exam_type, time, use_short_answer, 
                totalPeriodsHalf1, totalPeriodsHalf2,
                book_series // <--- BIẾN MỚI
            } = body;
            
            // --- KIỂM TRA LICENSE KV ---
            if (env.TEST_TOOL && license_key) { 
                const creditStr = await env.TEST_TOOL.get(license_key); 
                if (!creditStr) return new Response(JSON.stringify({ error: "MÃ SAI!" }), { status: 403, headers: corsHeaders });
                if (parseInt(creditStr) <= 0) return new Response(JSON.stringify({ error: "HẾT LƯỢT!" }), { status: 402, headers: corsHeaders });
            }

            // Xử lý mô tả topics
            let topicsDescription = "";
            topics.forEach((topic, index) => {
                topicsDescription += `\nCHƯƠNG ${index + 1}: ${topic.name}\n`;
                topic.units.forEach((unit, uIndex) => {
                    let periodInfo = "";
                    if (exam_type === 'hk') periodInfo = ` [Thời lượng: ${unit.p1} tiết (Nửa đầu), ${unit.p2} tiết (Nửa sau)]`;
                    topicsDescription += `   - Bài ${uIndex + 1}: ${unit.content}${periodInfo}\n`;
                });
            });
           
            // --- PROMPT (GIỮ NGUYÊN) ---
            const prompt = `
            Bạn là một trợ lý chuyên về xây dựng ma trận đề kiểm tra và đề kiểm tra theo quy định của Bộ Giáo dục và Đào tạo Việt Nam. Dựa trên Công văn số 7991/BGDĐT-GDTrH ngày 17/12/2024 và các hướng dẫn trong Phụ lục kèm theo. Bạn am hiểu sâu sắc chương trình giáo dục phổ thông 2018 (Ban hành kèm theo Thông tư số 32/2018/TT-BGDĐT ngày 26 tháng 12 năm 2018 của Bộ trưởng Bộ Giáo dục và Đào tạo).
            Bạn hiểu biết chuyên sâu về sách giáo khoa ${book_series} lớp 6, lớp 7, lớp 8, lớp 9, lớp 10, lớp 11, lớp 12 tham khảo tại địa chỉ "https://taphuan.nxbgd.vn/#/".
            Nhiệm vụ của bạn là xây dựng ma trận đề kiểm tra, bản đặc tả đề kiểm tra, đề kiểm tra và hướng dẫn chấm theo các yêu cầu dưới đây. KHÔNG thêm bất kỳ lời giải thích nào.
            ## YÊU CẦU ĐẦU VÀO
       
            1. Môn học: ${subject} - Lớp ${grade}
            2. Bộ sách giáo khoa: **${book_series}** (Quan trọng: Hãy sử dụng ngữ liệu, thuật ngữ và thứ tự kiến thức chuẩn xác theo bộ sách này).
            3. Kỳ thi: ${exam_type === 'hk' ? 'Cuối học kì' : 'Giữa học kì'} ${semester}.
            4. Thời gian: ${time} phút.
            5. Câu hỏi ngắn: ${use_short_answer ? 'CÓ' : 'KHÔNG'}.

            ## NỘI DUNG KIẾN THỨC CẦN RA ĐỀ:
            ${topicsDescription}
            
            ${exam_type === 'hk' ? `*LƯU Ý PHÂN BỐ ĐIỂM (HK): Tổng tiết Nửa đầu=${totalPeriodsHalf1}, Nửa sau=${totalPeriodsHalf2}.` : ''}
            ## KẾT QUẢ ĐẦU RA: TUÂN THỦ NGIÊM NGẶT CÁC YÊU CẦU SAU:
            Tạo ra 1 tài liệu sau đúng định dạng:

          ## KẾT QUẢ ĐẦU RA: TUÂN THỦ NGHIÊM NGẶT CÁC YÊU CẦU SAU:
**QUY ĐỊNH VỀ ĐIỂM SỐ ĐỂ TÍNH TOÁN (QUAN TRỌNG):**
*Trước khi tạo bảng, hãy sử dụng các trọng số sau để tính toán sao cho TỔNG ĐIỂM TOÀN BÀI LÀ 10:*
- Câu Trắc nghiệm nhiều lựa chọn (MCQ): 0.25 điểm/câu.
- Câu Đúng/Sai: Tính 1.0 điểm/câu lớn (gồm 4 ý nhỏ).
- Câu Trả lời ngắn: 0.5 điểm/câu.
- Câu Tự luận: 1.0 đến 2.0 điểm/câu (tùy chỉnh để tròn tổng 10).

### PHẦN 1 – MA TRẬN ĐỀ KIỂM TRA ĐỊNH KÌ
Tạo bảng HTML (<table border="1">) có đúng **19 cột**... và cấu trúc merge (gộp ô) như sau:

**1. PHẦN HEADER (CẤU TRÚC CỐ ĐỊNH):**
- **Dòng 1:**
  - Cột 1 (TT): Gộp A1:A4.
  - Cột 2 (Chủ đề/Chương): Gộp B1:B4.
  - Cột 3 (Nội dung/đơn vị kiến thức): Gộp C1:C4.
  - Cột 4-15 (Mức độ đánh giá): Gộp D1:O1.
  - Cột 16-18 (Tổng số điểm theo mức độ): Gộp P1:R1.
  - Cột 19 (Tỉ lệ % điểm): Gộp S1:S4.
- **Dòng 2:**
  - Gộp D2:L2 ghi "TNKQ".
  - Gộp M2:O2 ghi "Tự luận".
  - P2, Q2, R2: Để trống (Merge lại nếu cần hoặc để trống).
- **Dòng 3:**
  - Gộp D3:F3 ghi "Nhiều lựa chọn".
  - Gộp G3:I3 ghi "Đúng - Sai".
  - Gộp J3:L3 ghi "Trả lời ngắn".
  - Gộp M3:O3 ghi "Tự luận".
  - P3, Q3, R3: Để trống.
- **Dòng 4 (Chi tiết mức độ):**
  - D4, G4, J4, M4: Ghi "Biết".
  - E4, H4, K4, N4: Ghi "Hiểu".
  - F4, I4, L4, O4: Ghi "Vận dụng".
  - P4: "Tổng Biết", Q4: "Tổng Hiểu", R4: "Tổng Vận dụng".

**2. PHẦN NỘI DUNG BẢNG (DỮ LIỆU TỰ SINH):**
Từ dòng 5 trở đi:
- **Cột 1 (TT):** Số thứ tự 1, 2, 3...
- **Cột 2:** Tên chủ đề.
- **Cột 3:** Đơn vị kiến thức chi tiết.
- **Cột 4 đến O (Cột 4-15):** Điền **SỐ LƯỢNG CÂU HỎI** tương ứng với mức độ. (Ví dụ: 2, 1, 0...).
- **Cột P (Tổng điểm Biết):** = (Tổng số câu Biết ở các cột D,G,J,M) quy đổi ra điểm.
- **Cột Q (Tổng điểm Hiểu):** = (Tổng số câu Hiểu ở các cột E,H,K,N) quy đổi ra điểm.
- **Cột R (Tổng điểm Vận dụng):** = (Tổng số câu Vận dụng ở các cột F,I,L,O) quy đổi ra điểm.
- **Cột S (Tỉ lệ %):** = (Tổng điểm dòng đó / 10) * 100%.

**3. CÁC DÒNG TỔNG KẾT (CUỐI BẢNG):**
- **Dòng "Tổng số câu":** Tính tổng dọc từ trên xuống cho các cột từ D đến O. Cột P, Q, R tính tổng số câu theo mức độ.
- **Dòng "Tổng số điểm":**
  - Tính tổng điểm thực tế dựa trên số câu đã điền và trọng số điểm (MCQ=0.25, Đ/S=1.0, Ngắn=0.5, TL=1.0+).
  - **Lưu ý:** Ô S (Giao của dòng Tổng điểm và Cột 19) BẮT BUỘC PHẢI LÀ **10.0**.
- **Dòng "Tỉ lệ %":** Tính phần trăm tương ứng của các mức độ Biết/Hiểu/Vận dụng trên tổng 10 điểm.

---

### PHẦN 2 – BẢN ĐẶC TẢ ĐỀ KIỂM TRA ĐỊNH KÌ
Tạo bảng HTML có đúng **16 cột**:

**1. PHẦN HEADER:**
- Cột 1 (TT), Cột 2 (Chương), Cột 3 (Nội dung), Cột 4 (Yêu cầu cần đạt): Gộp dòng 1-4 tương ứng.
- **Dòng 1:** Gộp E1:P1 ("Số câu hỏi theo mức độ").
- **Dòng 2:** Gộp E2:M2 ("TNKQ"), Gộp N2:P2 ("Tự luận").
- **Dòng 3:**
  - E3-G3: "Nhiều lựa chọn".
  - H3-J3: "Đúng - Sai".
  - K3-M3: "Trả lời ngắn".
  - N3-P3: Để trống.
- **Dòng 4:** Ghi Biết, Hiểu, Vận dụng tương ứng cho từng loại câu hỏi như Ma trận.

**2. PHẦN NỘI DUNG:**
- **Cột 4 (Yêu cầu cần đạt):** Ghi rõ yêu cầu, mỗi đầu dòng là một mức độ (Gạch đầu dòng "- Biết...", "- Hiểu...", "- Vận dụng...").
  - Với mức độ Vận dụng, bắt buộc ghi mã năng lực ở cuối câu. Ví dụ: (NL: GQVĐ).
- **Cột 5 đến 16:** Điền số lượng câu hỏi khớp hoàn toàn với Ma trận ở Phần 1.

---

### PHẦN 3 – ĐỀ KIỂM TRA MẪU
Soạn thảo đề thi hoàn chỉnh dựa trên Ma trận và Đặc tả đã tạo:
1.  **I. TRẮC NGHIỆM KHÁCH QUAN** (Nhiều lựa chọn): 4 đáp án A,B,C,D.
2.  **II. ĐÚNG - SAI:** Mỗi câu hỏi có 4 ý a), b), c), d). Học sinh chọn Đúng hoặc Sai.
3.  **III. TRẢ LỜI NGẮN:** Câu hỏi yêu cầu điền số hoặc từ ngữ ngắn gọn.
4.  **IV. TỰ LUẬN:** Câu hỏi yêu cầu trình bày, giải quyết vấn đề.

**ĐÁP ÁN VÀ HƯỚNG DẪN CHẤM:**
- Trả về bảng đáp án trắc nghiệm.
- Hướng dẫn chấm tự luận chi tiết (chia nhỏ điểm 0.25).

---

### QUY TẮC CHUNG (BẮT BUỘC)

1.  **ĐỊNH DẠNG:**
    - Sử dụng HTML Table chuẩn (thẻ <table>, <thead>, <tbody>, <tr>, <th>, <td>, \`colspan\` / \`rowspan\`.)**.
    - Border="1", Cellpadding="5".
    - Không dùng Markdown table, không dùng code block cho bảng.
    - Công thức Toán/Lý/Hóa: Dùng LaTeX đặt trong dấu $$ (Ví dụ: $$ E = mc^2 $$).

2.  **LOGIC PHÂN BỔ KIẾN THỨC:**
    - Nếu đề bài có yếu tố "Học kỳ": Phân bổ điểm 25% (nửa đầu) - 75% (nửa sau) hoặc theo số tiết thực tế.
    - Nếu không có yếu tố thời gian cụ thể: Phân bổ đều các chủ đề.

3.  **CẤU TRÚC ĐỀ & ĐIỂM SỐ (QUAN TRỌNG NHẤT):**
    - **Tổng điểm toàn bài bắt buộc: 10 điểm.**
    - **Tỉ lệ mức độ nhận thức:** Biết (30-40%) - Hiểu (30-40%) - Vận dụng (20-30%).
    - **Cấu trúc câu hỏi:**
      - Trắc nghiệm nhiều lựa chọn: Chiếm khoảng 30% tổng điểm.
      - Đúng/Sai: Chiếm khoảng 20-30% tổng điểm.
      - Trả lời ngắn: Chiếm khoảng 20% tổng điểm.
      - Tự luận: Chiếm khoảng 20-30% tổng điểm.
    - *Lưu ý: AI được phép linh động số lượng câu hỏi mỗi loại +/- 1 câu để đảm bảo tổng điểm tròn 10.*

4.  **KIỂM TRA CHÉO:**
    - Số câu trong Đề = Số câu trong Đặc tả = Số câu trong Ma trận.
    - Mã câu hỏi trong đề phải khớp với ma trận.
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










