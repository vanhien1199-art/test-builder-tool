// File: functions/api_matrix.js
import { GoogleGenerativeAI } from "@google/generative-ai";

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
            
            // Dùng Gemini 2.5 Flash để đảm bảo tốc độ và độ chính xác
            const MODEL_NAME = "gemini-2.5-flash"; 

            const genAI = new GoogleGenerativeAI(apiKey);
            const model = genAI.getGenerativeModel({ model: MODEL_NAME });

            const body = await request.json();
            const { license_key, subject, grade, semester, exam_type, time, use_short_answer, topics } = body;

            // --- KIỂM TRA LICENSE (KV) ---
            if (env.TEST_TOOL && license_key) {
                const creditStr = await env.TEST_TOOL.get(license_key);
                if (!creditStr) return new Response(JSON.stringify({ error: "MÃ KHÔNG TỒN TẠI!" }), { status: 403, headers: corsHeaders });
                let currentCredit = parseInt(creditStr);
                if (currentCredit <= 0) return new Response(JSON.stringify({ error: "HẾT LƯỢT SỬ DỤNG!" }), { status: 402, headers: corsHeaders });
            }

            // Chuẩn bị dữ liệu đầu vào cho AI
            let topicsDescription = topics.map((t, index) => {
                let info = `Chủ đề ${index + 1}: ${t.name}`;
                info += `\n   - Nội dung: ${t.content}`;
                if (exam_type === "hk") {
                    info += `\n   - Số tiết Nửa đầu HK: ${t.p1}`;
                    info += `\n   - Số tiết Nửa sau HK: ${t.p2}`;
                }
                return info;
            }).join("\n");

            // --- PROMPT MỚI (GIỮ NGUYÊN VĂN 100% TỪ YÊU CẦU CỦA BẠN) ---
            const prompt = `
            Bạn là một trợ lý chuyên về xây dựng ma trận đề kiểm tra và đề kiểm tra theo quy định của Bộ Giáo dục và Đào tạo Việt Nam. Dựa trên Công văn số 7991/BGDĐT-GDTrH ngày 17/12/2024 và các hướng dẫn trong Phụ lục kèm theo, hãy tạo các tài liệu sau:

            ## YÊU CẦU ĐẦU VÀO
            Cung cấp các thông tin sau để tạo ma trận và đề kiểm tra:

            1. **Môn học:** ${subject} lớp ${grade}
            2. **Học kì:** ${semester}, năm học 2024-2025
            3. **Loại kiểm tra:** ${exam_type === 'hk' ? 'Kiểm tra học kì' : 'Kiểm tra định kì giữa kì'}
            4. **Chủ đề/Chương cần kiểm tra:** (Xem danh sách bên dưới)
            5. **Nội dung/đơn vị kiến thức:** ${topicsDescription}
            6. **Thời lượng kiểm tra:** ${time} phút
            7. **Có sử dụng câu hỏi "Trả lời ngắn" không?** ${use_short_answer ? 'Có' : 'Không'}
            8. **Tỉ lệ điểm phân bổ:** Theo mẫu chuẩn 7991

            ## KẾT QUẢ ĐẦU RA
            Tạo ra 1 tài liệu sau đúng định dạng:

            === PHẦN 1 – MA TRẬN ĐỀ KIỂM TRA ĐỊNH KÌ (phải giống 100%) ===
            Tạo bảng có đúng 19 cột và cấu trúc như sau:

            * PHẦN HEADER
            - Dòng 1 đến dòng 4 cột 1 (TT) gộp ô A1:A4
            - Cột 2 (Chủ đề/Chương) gộp B1:B4
            - Cột 3 (Nội dung/đơn vị kiến thức) gộp ô C1:C4
            - Dòng 1: gộp các ô của cột 4 đến cột 15 - D1:O1 (Mức độ đánh giá)
            - Gộp ô P1:R1 (Tổng)
            - Cột 19 (Tỉ lệ % điểm) gộp S1:S4
            - Dòng 2: Gộp ô D2:L2 (TNKQ); gộp ô M2:O2 (Tự luận); gộp ô P2:R3 (để trống không điền gì); ô S2:S3 (để trống)
            - Dòng 3: Gộp ô D3:F3 (Nhiều lựa chọn); gộp ô G3:I3 ("Đúng - Sai"); gộp ô J3:L3 (Trả lời ngắn)
            - Dòng 4: 
              • Cột 4 - ô D4: "Biết"
              • Cột 5 - ô E4: "Hiểu"
              • Cột 6 - ô F4: "Vận dụng"
              → Lặp lại đúng 3 mức độ này cho đến ô O4 theo thứ tự: Biết, Hiểu, Vận dụng

            * PHẦN NỘI DUNG BẢNG
            Từ dòng 5 trở đi: điền nội dung ví dụ thực tế dựa trên đầu vào
            - Cột 1 (TT): 1, 2, 3, 4, …, sau cùng là các dòng: "Tổng số câu", "Tổng số điểm", "Tỉ lệ %"
            - Cột 2: Tên chủ đề - lấy từ chủ đề nhập từ đầu vào
            - Cột 3: Nội dung/đơn vị kiến thức - lấy từ đầu vào (chi tiết cho từng chủ đề)
            - Từ cột 4 đến cột 15: chỉ ghi số câu hỏi hoặc số điểm (ví dụ: 1, 0.5, 2…)
            - Cột 16-18 (Tổng): tính tổng từng mức độ nhận thức của từng chủ đề
            - Cột 19: Tỉ lệ % của từng chủ đề (tự tính dựa trên điểm và QUY TẮC PHÂN BỔ)

            Dòng "Tổng số điểm": tổng đúng 10,0 điểm
            Dòng "Tỉ lệ %": đúng như mẫu công văn (30% – 20% – 20% – 30% – 40% – 30% – 30% …)

            === PHẦN 2 – BẢN ĐẶC TẢ ĐỀ KIỂM TRA ĐỊNH KÌ (phải giống 100%) ===
            Tạo bảng có đúng 16 cột và cấu trúc gộp ô như sau:

            * PHẦN HEADER
            - Dòng 1 đến dòng 4 cột 1 (TT) gộp A1:A4
            - Cột 2 (Chủ đề/Chương) gộp B1:B4
            - Cột 3 (Nội dung/đơn vị kiến thức) gộp C1:C4
            - Cột 4 (Yêu cầu cần đạt) gộp D1:D4
            - Dòng 1: gộp ô E1:P1 (Số câu hỏi ở các mức độ đánh giá)
            - Dòng 2: gộp ô E2:M2 (TNKQ); gộp ô N2:P2 (Tự luận)
            - Dòng 3: gộp ô E3:G3 (Nhiều lựa chọn); gộp ô H3:J3 ("Đúng - Sai"); gộp ô K3:M3 (Trả lời ngắn); gộp ô N3:P3 (để trống không ghi gì)
            - Dòng 4:
              • E4: "Biết", F4: "Hiểu", G4: "Vận dụng" → Nhiều lựa chọn
              • H4: "Biết", I4: "Hiểu", J4: "Vận dụng" → Đúng - Sai
              • K4: "Biết", L4: "Hiểu", M4: "Vận dụng" → Trả lời ngắn
              • N4: "Biết", O4: "Hiểu", P4: "Vận dụng" → Tự luận

            * PHẦN NỘI DUNG BẢNG
            Từ dòng 5 trở đi (nội dung):
            - Cột 1 (TT): 1, 2, 3, 4, … (số thứ tự)
            - Cột 2: Tên chủ đề (giống ma trận)
            - Cột 3: Nội dung chi tiết (giống ma trận)
            - Cột 4 (Yêu cầu cần đạt): 
              • Mỗi mức độ ghi trên 1 dòng riêng
              • Bắt đầu bằng "- Biết …" (dòng 1)
              • "- Hiểu …" (dòng 2)
              • "- Vận dụng …" (dòng 3)
              → Nếu là Vận dụng thì ghi thêm ở cuối dòng: (NL: THTN) hoặc (NL: GQVĐ) hoặc (NL: MĐKH) hoặc (NL: GTKH) tùy năng lực
            - Cột 5 đến cột 16 (E đến P): ghi số thứ tự câu hỏi (ví dụ: 1, 2, 3, 4…) hoặc số điểm (0.5, 1.0…)
            - Dòng cuối: "Tổng số câu", "Tổng số điểm", "Tỉ lệ %" (đúng như mẫu công văn)

            === PHẦN 3 – ĐỀ KIỂM TRA MẪU ===
            Tạo đề kiểm tra hoàn chỉnh dựa trên ma trận và bản đặc tả:
            1. **PHẦN TRẮC NGHIỆM KHÁCH QUAN** (60-70% điểm)
               - Câu hỏi nhiều lựa chọn: Đánh số từ 1 đến N, mỗi câu 4 phương án A, B, C, D
               - Câu hỏi Đúng-Sai: Mỗi câu gồm 4 ý nhỏ (a, b, c, d), học sinh chọn Đ/S
               - Câu hỏi trả lời ngắn (nếu có): Yêu cầu điền từ/cụm từ
               
            2. **PHẦN TỰ LUẬN** (30-40% điểm)
               - Câu hỏi phân theo mức độ: Biết, Hiểu, Vận dụng
               - Mỗi câu ghi rõ số điểm

            3. **ĐÁP ÁN VÀ HƯỚNG DẪN CHẤM** (tóm tắt)

            === PHẦN 4 – XUẤT FILE WORD ===
            Cung cấp mã định dạng để chuyển đổi thành file Word:
            1. Định dạng tiêu đề: BỘ GIÁO DỤC VÀ ĐÀO TẠO, số công văn, ngày tháng
            2. Định dạng bảng: Border đầy đủ, merge cell chính xác
            3. Font chữ: Times New Roman, size 13-14
            4. Căn lề: Trái, phải, trên, dưới: 2cm
            5. Đánh số trang

            ## QUY TẮC CHUNG
            1. **TÍNH TỰ ĐỘNG VÀ PHÂN BỔ:**
               - AI phải tự tính toán số câu hỏi dựa trên thời lượng kiểm tra
               - **Nếu là đề kiểm tra định kì giữa kì:** Phân bổ đều theo chủ đề
               - **Nếu là đề kiểm tra HỌC KÌ:** • Tính tỉ lệ % kiến thức: 25% nửa đầu học kì + 75% nửa sau học kì
                 • Dựa vào số tiết dạy để tính trọng số từng chủ đề
                 • Ví dụ: Chủ đề A (nửa đầu: 5 tiết, nửa sau: 15 tiết) → Trọng số = (5×0.25 + 15×0.75)/20 = 62.5%

            2. **ĐỘ KHÓ VÀ PHÂN BỔ MỨC ĐỘ:**
               - Mỗi chủ đề phải có ít nhất 20% câu hỏi ở mức Vận dụng
               - Phân bổ mức độ: Biết (30-40%), Hiểu (30-40%), Vận dụng (20-30%)
               - Cấu trúc đề: TNKQ (60-70%), Tự luận (30-40%)

            3. **NĂNG LỰC ĐÁNH GIÁ:**
               - Mỗi chủ đề phải đánh giá ít nhất 1 năng lực chuyên biệt
               - Mã năng lực:
                 • NL: THTN = Tìm hiểu tự nhiên
                 • NL: GQVĐ = Giải quyết vấn đề
                 • NL: MĐKH = Mô tả và giải thích hiện tượng
                 • NL: GTKH = Giao tiếp khoa học
                 • NL: SDCN = Sử dụng công cụ và ngôn ngữ khoa học

            4. **LIÊN KẾT VÀ KIỂM TRA:**
               - Mỗi câu hỏi trong đề phải có mã tham chiếu đến ô trong ma trận (Ví dụ: Câu 1 [M1-B])
               - Kiểm tra chéo: Tổng điểm ma trận = Tổng điểm bản đặc tả = 10 điểm
               - Số câu hỏi trong đề = Số câu trong ma trận

            5. **ĐỊNH DẠNG VÀ NGÔN NGỮ:**
               - Sử dụng markdown table với merge cell chính xác
               - Ngôn ngữ: Tiếng Việt chuẩn
               - Ghi rõ: "Theo Công văn 7991/BGDĐT-GDTrH và Thông tư 22/2021/TT-BGDĐT"

            6. **TÍNH TỰ ĐỘNG:**
               - Tự động tính số lượng câu hỏi phù hợp với ${time} phút.
            `;

            const result = await model.generateContent(prompt);
            const text = result.response.text();

            // Trừ tiền
            if (env.TEST_TOOL && license_key) {
                const creditStr = await env.TEST_TOOL.get(license_key);
                if (creditStr) {
                    let current = parseInt(creditStr);
                    if (current > 0) await env.TEST_TOOL.put(license_key, (current - 1).toString());
                }
            }

            return new Response(JSON.stringify({ result: text }), { 
                headers: { ...corsHeaders, "Content-Type": "application/json" } 
            });

        } catch (error) {
            return new Response(JSON.stringify({ 
                error: `Lỗi AI: ${error.message}` 
            }), { status: 500, headers: corsHeaders });
        }
    }
}
