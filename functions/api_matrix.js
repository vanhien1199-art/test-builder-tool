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
**QUY ĐỊNH VỀ ĐIỂM SỐ VÀ TÍNH TOÁN (QUAN TRỌNG):**
*Trước khi tạo bất kỳ bảng nào, hãy thực hiện các bước tính toán sau một cách chính xác để đảm bảo TỔNG ĐIỂM TOÀN BÀI LUÔN LÀ 10, tuân thủ phân bố điểm và số lượng câu hỏi dựa trên thời lượng:*
1. **Xác định loại đề và phân bổ kiến thức theo chủ đề:**
   - Nếu là đề kiểm tra định kỳ giữa kỳ: Phân bổ tỉ lệ điểm đều theo số lượng chủ đề/đơn vị kiến thức từ đầu vào.Theo công thức: tỉ lệ điểm = Số tiết/tổng số tiết 
   - Nếu là đề kiểm tra học kỳ:
     - Phân bổ tỉ lệ kiến thức tổng thể: 25% cho nửa đầu học kỳ + 75% cho nửa sau học kỳ.
     - Tính trọng số điểm cho từng đơn vị kiến thức dựa trên số tiết dạy:
       - Tổng tiết nửa đầu: Tính tổng số tiết của các đơn vị thuộc nửa đầu.
       - Tổng tiết nửa sau: Tính tổng số tiết của các đơn vị thuộc nửa sau.
       - Tỉ lệ  điểm cho một đơn vị ở nửa đầu = (Số tiết của đơn vị × 0.25) / Tổng tiết nửa đầu.
       - Tỉ lệ điểm cho một đơn vị ở nửa sau = (Số tiết của đơn vị × 0.75) / Tổng tiết nửa sau.
       - Đảm bảo tổng tỉ lệ điểm tất cả đơn vị = 100%.

2. **Phân bổ điểm theo dạng câu hỏi (tổng 10 điểm):**
   - Câu hỏi nhiều lựa chọn (MCQ): 30% → 3.0 điểm.
   - Câu hỏi Đúng-Sai: 20% → 2.0 điểm.
   - Câu hỏi Trả lời ngắn: 20% → 2.0 điểm.
   - Câu hỏi Tự luận: 30% → 3.0 điểm.
   - Phần Trắc nghiệm khách quan (TNKQ, bao gồm MCQ + Đúng-Sai + Trả lời ngắn): 70% → 7.0 điểm.
   - Phần Tự luận: 30% → 3.0 điểm.

3. **Phân bổ điểm theo mức độ nhận thức (tổng 10 điểm, linh hoạt nếu cần):**
   - Biết: 40% → 4.0 điểm (linh hoạt 30-40%).
   - Hiểu: 30% → 3.0 điểm (linh hoạt 30-40%).
   - Vận dụng: 30% → 3.0 điểm (linh hoạt 20-30%).
   - Mỗi chủ đề/đơn vị kiến thức phải có ít nhất 20% điểm ở mức Vận dụng.

4. **Tính số lượng câu hỏi dựa trên trọng số điểm mỗi dạng và thời lượng kiểm tra (${time} phút):**
   - Trọng số điểm từng dạng câu hỏi:
     - MCQ: 0.25 điểm/câu.
     - Đúng-Sai: 1.0 điểm/câu chùm (mỗi câu chùm gồm đúng 4 câu nhỏ a,b,c,d).
     - Trả lời ngắn: 0.5 điểm/câu.
     - Tự luận: 1.0 đến 2.0 điểm/câu (điều chỉnh để tổng điểm chính xác là 3.0 cho phần này, ưu tiên tròn số).
   - Tính số câu tối thiểu dựa trên điểm phân bổ:
     - MCQ: Số câu = 3.0 / 0.25 = 12 câu.
     - Đúng-Sai: Số câu chùm = 1-2 câu (tức 4-8 ý nhỏ, mỗi câu: 0,25đ).
     - Trả lời ngắn: Số câu = 2.0 / 0.5 = 4 câu.
     - Tự luận: Số câu = khoảng 2-4 câu, điều chỉnh điểm từng câu để tổng = 3.0 (ví dụ: 2 câu × 1.5 = 3.0).
   - Điều chỉnh số câu tổng thể phù hợp thời lượng (tổng câu bao gồm câu lớn Đúng-Sai tính là 1 câu/câu lớn):
     - 45 phút: 20-30 câu tổng (15-22 TNKQ + 2-3 Tự luận).
     - 60 phút: 25-35 câu tổng (18-26 TNKQ + 3-4 Tự luận).
     - 90 phút: 30-40 câu tổng (20-30 TNKQ + 4-5 Tự luận).
   - Nếu số câu tính từ điểm vượt quá giới hạn thời lượng, giảm nhẹ số câu MCQ/Trả lời ngắn và tăng điểm Tự luận để giữ tổng 10, nhưng giữ phân bổ dạng gần nhất có thể.

5. **Phân bổ câu hỏi và điểm theo chủ đề/đơn vị + mức độ:**
   - Đối với mỗi đơn vị kiến thức: Phân bổ điểm theo trọng số từ bước 1, sau đó chia theo mức độ (Biết/Hiểu/Vận dụng) và dạng câu hỏi.
   - Đảm bảo mỗi chủ đề đánh giá ít nhất 1 năng lực chuyên biệt ở mức Vận dụng (mã: NL: THTN = Tìm hiểu tự nhiên; NL: GQVĐ = Giải quyết vấn đề; NL: MĐKH = Mô tả và giải thích hiện tượng; NL: GTKH = Giao tiếp khoa học; NL: SDCN = Sử dụng công cụ và ngôn ngữ khoa học).
   - Kiểm tra chéo: Tổng điểm ma trận = Tổng điểm đặc tả = Tổng điểm đề = 10. Số câu đề = Số câu ma trận.

** Tạo ra 1 tài liệu sau đúng định dạng - tuân thủ cực kì nghiêm ngặt cấu trúc bảng:
I – MA TRẬN ĐỀ KIỂM TRA ĐỊNH KÌ
Tạo bảng có đúng 19 cột và cấu trúc như sau:
* PHẦN HEADER
- **Dòng 1:**
  - Cột 1 (TT): Gộp A1:A4.
  - Cột 2 (Chủ đề/Chương): Gộp B1:B4.
  - Cột 3 (Nội dung/đơn vị kiến thức): Gộp C1:C4.
  - Cột 4-15 (Mức độ đánh giá): Gộp D1:O1.
  - Cột 16-18 (Tổng): Gộp P1:R1.
  - Cột 19 (Tỉ lệ % điểm): Gộp S1:S4.
- **Dòng 2:**
  - Gộp D2:L2 ghi "TNKQ".
  - Gộp M2:O2 ghi "Tự luận".
  - Gôp P2:R3: Để trống
- **Dòng 3:**
  - Gộp D3:F3 ghi "Nhiều lựa chọn".
  - Gộp G3:I3 ghi "Đúng - Sai".
  - Gộp J3:L3 ghi "Trả lời ngắn".
  - Gộp M3:O3 ghi "Tự luận".
 - **Dòng 4 (Chi tiết mức độ):**
  - D4, G4, J4, M4: Ghi "Biết".
  - E4, H4, K4, N4: Ghi "Hiểu".
  - F4, I4, L4, O4: Ghi "Vận dụng".
  - P4: Ghi "Biết", Q4: Ghi "Hiểu", R4: Ghi "Vận dụng".
* PHẦN NỘI DUNG BẢNG
Từ dòng 5 trở đi: điền nội dung dựa trên tính toán và đầu vào.
- Cột 1 (TT): 1, 2, 3, 4, …, sau cùng là các dòng: "Tổng số câu", "Tổng số điểm", "Tỉ lệ %".
- Cột 2: Tên chủ đề từ đầu vào.
- Cột 3: Nội dung/đơn vị kiến thức từ đầu vào.
- Từ cột 4 đến cột 15: Ghi số câu hỏi (cho MCQ, Đúng-Sai, Trả lời ngắn) hoặc điểm (cho Tự luận).
- Cột 16: Tính tổng số câu phần Biết (=D+G+J+M).
- Cột 17: Tính tổng (=E+H+K+N).
- Cột 18: Tính tổng (=F+I+L+O).
- Cột 19: Tỉ lệ % điểm của đơn vị.
Dòng "Tổng số câu": Tính tổng số câu theo cột (riêng cột 19 = P+Q+R).
Dòng "Tổng số điểm": Tính tổng điểm của từng loại câu hỏi
	gộp ô D:F và tính tổng điểm câu hỏi nhiều lựa chọn
        gộp ô D:F và điền tổng điểm của các câu hỏi nhiều lựa chọn ở cột D,E,F
        Gộp ô G:I và điền tổng điểm của các câu hỏi Đúng-Sai ở cột G,H,I
        Gộp ô J:L và điền tổng điểm của các câu hỏi trả lời ngắn ở cột J,K,L
        Gộp ô M:O và điền tổng điểm của các câu hỏi tự luận ở cột M, N,O
        Ô Q tính tổng điểm phần hiểu
        Ô R tính tổng điểm phần vận dụng
        Ô S - cột 19: tính tổng các ô P, Q, R của dòng này (tổng phải đúng 10,0 điểm)
Dòng "Tỉ lệ %": Tương tự "Tổng số điểm" nhưng % (S: 100%).

II – BẢN ĐẶC TẢ ĐỀ KIỂM TRA ĐỊNH KÌ
Tạo bảng có đúng 16 cột và cấu trúc gộp ô như sau:
* PHẦN HEADER
- Dòng 1 đến dòng 4 cột 1 (TT) gộp A1:A4.
- Cột 2 (Chủ đề/Chương) gộp B1:B4.
- Cột 3 (Nội dung/đơn vị kiến thức) gộp C1:C4.
- Cột 4 (Yêu cầu cần đạt) gộp D1:D4.
- Dòng 1: gộp ô E1:P1 (Số câu hỏi ở các mức độ đánh giá).
- Dòng 2: gộp ô E2:M2 (TNKQ); gộp ô N2:P2 (Tự luận).
- Dòng 3: gộp ô E3:G3 (Nhiều lựa chọn); gộp ô H3:J3 ("Đúng - Sai"); gộp ô K3:M3 (Trả lời ngắn); gộp ô N3:P3 (Tự luận).
- Dòng 4:
  • E4: "Biết", F4: "Hiểu", G4: "Vận dụng" → Nhiều lựa chọn.
  • H4: "Biết", I4: "Hiểu", J4: "Vận dụng" → Đúng - Sai.
  • K4: "Biết", L4: "Hiểu", M4: "Vận dụng" → Trả lời ngắn.
  • N4: "Biết", O4: "Hiểu", P4: "Vận dụng" → Tự luận.
* PHẦN NỘI DUNG BẢNG
Từ dòng 5 trở đi:
- Cột 1 (TT): 1, 2, 3, 4, …
- Cột 2: Tên chủ đề.
- Cột 3: Nội dung chi tiết.
- Cột 4 (Yêu cầu cần đạt): Mỗi mức độ trên dòng riêng: "- Biết …<br>- Hiểu …<br>- Vận dụng … (NL: mã năng lực)".
- Cột 5 đến 16 (E đến P): Ghi số thứ tự câu hỏi hoặc điểm.
- Dòng cuối: "Tổng số câu", "Tổng số điểm", "Tỉ lệ %" (lấy từ ma trận).

III – ĐỀ KIỂM TRA MẪU
Tạo đề kiểm tra hoàn chỉnh dựa trên ma trận và đặc tả:
1. PHẦN TRẮC NGHIỆM KHÁCH QUAN (7.0 điểm)
   A. PHẦN 1: Câu trắc nghiệm nhiều phương án lựa chọn (3,0đ): Đánh số từ 1 đến N, mỗi câu 4 phương án A, B, C, D.
   B. PHẦN 2: Câu hỏi Đúng-Sai: Mỗi câu chùm gồm 4 câu nhỏ (a, b, c, d). Ở mỗi câu chùm thí sinh chọn phương án đúng hoặc phương án sai. (Đúng ghi Đ; Sai ghi S).
   				dùng bảng 3 cột: Nội dung, Đúng, Sai. Cột nội dung: Ghi nội dung câu hỏi; Cột Đúng, Sai: Để trống
   C. Phần 3: Câu hỏi trả lời ngắn: Yêu cầu điền từ/cụm từ.
2. PHẦN TỰ LUẬN (3.0 điểm)
   - Câu hỏi phân theo mức độ: Biết, Hiểu, Vận dụng.
   - Mỗi câu ghi rõ số điểm.
3. ĐÁP ÁN VÀ HƯỚNG DẪN CHẤM.
Mỗi câu hỏi trong đề phải có mã tham chiếu đến ma trận (ví dụ: Câu 1 [M1-B]).
		YÊU CẦU CẤU TRÚC ĐÁP ÁN & HDC:
		PHẦN I. TRẮC NGHIỆM KHÁCH QUAN
		A. PHẦN 1: Câu trắc nghiệm nhiều phương án lựa chọn (3,0đ)
		- Mỗi câu hỏi thí sinh chỉ chọn một phương án
		- Mỗi câu đúng được 0,25 điểm
		- Định dạng bảng:
	  	+ Dòng 1: Tiêu đề "Câu" + số câu từ 1 đến 12
	  	+ Dòng 2: Tiêu đề "Đ. Án" + đáp án tương ứng (A/B/C/D)
		B. PHẦN 2: Câu trắc nghiệm đúng sai (2,0đ)
		- Điểm tối đa của 01 câu hỏi là 1,0 điểm (dạng câu chùm)
		- Mỗi ý đúng được 0,25 điểm
		- Mỗi câu có 4 ý nhỏ (a, b, c, d)
		- Định dạng bảng như phần đề bổ sung đáp án
		
		C. PHẦN 3: Câu trắc nghiệm trả lời ngắn (2,0đ)
		- Mỗi câu trả lời đúng được 0,5 điểm
		- Định dạng: Liệt kê từng câu với câu trả lời ngắn
		
		PHẦN II. TỰ LUẬN (3,0 điểm)
		
		- Dùng bảng 3 cột: Câu, Nội dung, Điểm
		- Cột "Câu": Ghi số câu (1, 2, 3, 4...)
		- Cột "Nội dung": 
		  + Câu tự luận phải có lời giải chi tiết
		  + Các bước giải rõ ràng
		  + Công thức tính toán đầy đủ
		- Cột "Điểm": 
		  + Phân bổ điểm cho từng bước
		  + Tổng điểm mỗi câu phải khớp với đề bài
** QUY TẮC CHUNG (BẮT BUỘC)
1. ĐỊNH DẠNG VÀ NGÔN NGỮ:
   - MỌI ma trận và bảng dữ liệu phải được xuất dưới dạng HTML TABLE (thẻ <table>, <thead>, <tbody>, <tr>, <th>, <td>).
   - Không viết lời mở đầu. KHÔNG sử dụng Markdown table (|---|); không sử dụng code block (\`\`\`). Tuyệt đối không dùng dấu ** (sao sao), dấu #.
   - Khi cần gộp ô, dùng thuộc tính \`colspan\` / \`rowspan\`.
   - Table phải có border="1".
   - In đậm: dùng thẻ <b>...</b> (Ví dụ: <b>Câu 1.</b>)
   - Xuống dòng: dùng thẻ <br> (Ví dụ: A. Đáp án A <br> B. Đáp án B)
   - Đoạn văn: dùng thẻ <p>...</p>
   - Trả về chuẩn HTML (UTF-8), KHÔNG chèn JavaScript hay CSS inline trong phần bảng.
- CÔNG THỨC TOÁN HỌC, VẬT LÍ, HÓA HỌC:
      Bao quanh công thức bằng dấu $$ (ví dụ: $$ x^2 + \sqrt{5} $$).
      KHÔNG dùng MathML.
      LaTeX phải chuẩn (ví dụ dùng \frac{a}{b} cho phân số).
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














