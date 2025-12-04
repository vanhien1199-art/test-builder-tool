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

            // --- CẤU HÌNH MODEL CHUẨN 2025: GEMINI 2.5 FLASH ---
            // 1.5 đã bị xóa (404). 
            // 2.0-exp bị chặn vùng (400).
            // 2.5-flash là bản ổn định thay thế, chạy tốt với Streaming.
            const MODEL_NAME = "gemini-exp-1206"; 

            const genAI = new GoogleGenerativeAI(apiKey);
            const model = genAI.getGenerativeModel({ model: MODEL_NAME });

            const body = await request.json();
            const { license_key, subject, grade, semester, time, totalPeriodsHalf1, totalPeriodsHalf2, topics, exam_type, use_short_answer } = body;

            // KIỂM TRA LICENSE
            if (env.TEST_TOOL && license_key) {
                const creditStr = await env.TEST_TOOL.get(license_key);
                if (!creditStr || parseInt(creditStr) <= 0) {
                    return new Response(JSON.stringify({ error: "MÃ LỖI HOẶC HẾT HẠN" }), { status: 403, headers: corsHeaders });
                }
            }

            // Chuẩn bị dữ liệu Prompt
            let topicsDescription = topics.map((t, index) => {
                return `Chủ đề ${index + 1}: ${t.name} (Nội dung: ${t.content}, Tiết đầu: ${t.p1}, Tiết sau: ${t.p2})`;
            }).join("\n");

            // --- PROMPT (GIỮ NGUYÊN VĂN BẠN CUNG CẤP) ---
            const prompt = `
            Bạn là một trợ lý chuyên về xây dựng ma trận đề kiểm tra và đề kiểm tra theo quy định của Bộ Giáo dục và Đào tạo Việt Nam. Dựa trên Công văn số 7991/BGDĐT-GDTrH ngày 17/12/2024 và các hướng dẫn trong Phụ lục kèm theo. Bạn am hiểu sâu sắc chương trình giáo dục phổ thông 2018 (Ban hành kèm theo Thông tư số 32/2018/TT-BGDĐT ngày 26 tháng 12 năm 2018 của Bộ trưởng Bộ Giáo dục và Đào tạo).
            Bạn hiểu biết chuyên sâu về sách giáo khoa lớp 6, lớp 7, lớp 8, lớp 9, lớp 10, lớp 11, lớp 12 tham khảo tại địa chỉ "https://taphuan.nxbgd.vn/#/".
            Nhiệm vụ của bạn là xây dựng ma trận đề kiểm tra, bản đặc tả đề kiểm tra, đề kiểm tra và hướng dẫn chấm theo các yêu cầu dưới đây. KHÔNG thêm bất kỳ lời giải thích nào.
            ## YÊU CẦU ĐẦU VÀO
            Cung cấp các thông tin sau để tạo ma trận và đề kiểm tra:

            1. Môn học: ${subject} lớp ${grade}
            2. Học kì: ${semester}, năm học 2024-2025
            3. Loại kiểm tra: ${exam_type === 'hk' ? 'Kiểm tra học kì' : 'Kiểm tra định kì giữa kì'}
            4. Chủ đề/Chương cần kiểm tra: (Xem danh sách bên dưới)
            5. Nội dung/đơn vị kiến thức: ${topicsDescription}
            6. Thời lượng kiểm tra: ${time} phút
            7. Có sử dụng câu hỏi "Trả lời ngắn" không? ${use_short_answer ? 'Có' : 'Không'}
            8. Tỉ lệ điểm phân bổ: Theo mẫu chuẩn 7991

            ## KẾT QUẢ ĐẦU RA
            Tạo ra 1 tài liệu sau đúng định dạng:

           PHẦN 1 – MA TRẬN ĐỀ KIỂM TRA ĐỊNH KÌ
            Tạo bảng có đúng 19 cột và cấu trúc như sau:
            * PHẦN HEADER
            - Dòng 1 đến dòng 4 cột 1 (TT) gộp ô A1:A4
            - Cột 2 (Chủ đề/Chương) gộp B1:B4
            - Cột 3 (Nội dung/đơn vị kiến thức) gộp ô C1:C4
            - Dòng 1: gộp các ô của cột 4 đến cột 15 - D1:O1 (Mức độ đánh giá)
            - Gộp ô P1:R1 (Tổng)
            - Cột 19 (Tỉ lệ % điểm) gộp S1:S4
            - Dòng 2: Gộp ô D2:L2 (TNKQ); gộp ô M2:O2 (Tự luận); gộp ô P2:R2 (để trống không điền gì); ô S2 (để trống)
            - Dòng 3: Gộp ô D3:F3 (Nhiều lựa chọn); gộp ô G3:I3 ("Đúng - Sai"); gộp ô J3:L3 (Trả lời ngắn);gộp ô P3:R3 (để trống không điền gì); ô S2 (để trống)
            - Dòng 4: 
              • Cột 4 - ô D4: "Biết"
              • Cột 5 - ô E4: "Hiểu"
              • Cột 6 - ô F4: "Vận dụng"
              → Lặp lại đúng 3 mức độ này cho đến ô R4 theo thứ tự: Biết, Hiểu, Vận dụng
              Cột 19 - ô S4: Để trống không ghi gì

            * PHẦN NỘI DUNG BẢNG
            Từ dòng 5 trở đi: điền nội dung ví dụ thực tế dựa trên đầu vào
            - Cột 1 (TT): 1, 2, 3, 4, …, sau cùng là các dòng: "Tổng số câu", "Tổng số điểm", "Tỉ lệ %"
            - Cột 2: Tên chủ đề - lấy từ chủ đề nhập từ đầu vào
            - Cột 3: Nội dung/đơn vị kiến thức - lấy từ đầu vào (chi tiết cho từng chủ đề)
            - Từ cột 4 đến cột 15: chỉ ghi số câu hỏi hoặc số điểm (ví dụ: 1, 0.5, 2…)
            - Cột 16-18 (Tổng): tính tổng từng mức độ nhận thức của từng chủ đề
            - Cột 19: Tính Tỉ lệ % của từng đơn vị kiến thức (tự tính dựa trên điểm và QUY TẮC PHÂN BỔ)
            Dòng "Tổng số câu": từ cột 5 đến cột 18 tính tổng số câu theo cột từ dòng 5 xuống
            Dòng "Tổng số điểm": 
                    gộp ô D:F và tính tổng điểm câu hỏi nhiều lựa chọn
                    Gộp ô G:I và tính tổng điểm câu hỏi Đúng-Sai
                    Gộp ô J:L và tính tổng điểm câu hỏi trả lời ngắn
                    Gộp ô M:O và tính tổng điểm câu hỏi tự luận
                    Ô P của dòng này tính tổng điểm phần  biết
                    ô Q tính tổng điểm phần hiểu
                    Ô R tính tổng điểm phần vận dụng
                    Ô S - cột 19: tính tổng các ô P, Q, R của dòng này (tổng phải đúng 10,0 điểm)
            Dòng "Tỉ lệ %": Gộp ô và điền tỉ lệ tương tự  Dòng "Tổng số điểm"
                    ô S - cột 19: Tính Tổng tỉ lệ

          PHẦN 2 – BẢN ĐẶC TẢ ĐỀ KIỂM TRA ĐỊNH KÌ
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
            - Dòng cuối: "Tổng số câu", "Tổng số điểm", "Tỉ lệ %" (lấy từ ma trận)

          PHẦN 3 – ĐỀ KIỂM TRA MẪU
            Tạo đề kiểm tra hoàn chỉnh dựa trên ma trận và bản đặc tả:
            1. PHẦN TRẮC NGHIỆM KHÁCH QUAN (60-70% điểm)
               - Câu hỏi nhiều lựa chọn: Đánh số từ 1 đến N, mỗi câu 4 phương án A, B, C, D
               - Câu hỏi Đúng-Sai: Mỗi câu gồm 4 ý nhỏ (a, b, c, d), học sinh chọn Đ/S
               - Câu hỏi trả lời ngắn (nếu có): Yêu cầu điền từ/cụm từ
            2. PHẦN TỰ LUẬN (30-40% điểm)
               - Câu hỏi phân theo mức độ: Biết, Hiểu, Vận dụng
               - Mỗi câu ghi rõ số điểm

            3. ĐÁP ÁN VÀ HƯỚNG DẪN CHẤM (tóm tắt)

            ## QUY TẮC CHUNG (BẮT BUỘC)
            1. ĐỊNH DẠNG VÀ NGÔN NGỮ:
               - MỌI ma trận và bảng dữ liệu phải được xuất dưới dạng HTML TABLE (thẻ <table>, <thead>, <tbody>, <tr>, <th>, <td>).
               - KHÔNG sử dụng Markdown table (|---|); không sử dụng code block (\`\`\`). Tuyệt đối không dùng dấu ** (sao sao), dấu #.
               - Khi cần gộp ô, dùng thuộc tính \`colspan\` / \`rowspan\`.
               - In đậm: dùng thẻ <b>...</b> (Ví dụ: <b>Câu 1.</b>)
               - Xuống dòng: dùng thẻ <br> (Ví dụ: A. Đáp án A <br> B. Đáp án B)
               - Đoạn văn: dùng thẻ <p>...</p>
               - Trả về chuẩn HTML (UTF-8), KHÔNG chèn JavaScript hay CSS inline trong phần bảng.
               - Ngôn ngữ: Tiếng Việt chuẩn.
            2. TÍNH TOÁN:
            - AI phải tự tính toán số câu hỏi dựa trên thời lượng kiểm tra
            - Nếu là đề kiểm tra định kì giữa kì:Phân bổ đều theo chủ đề
            - Nếu là đề kiểm tra HỌC KÌ:
                 • Tính tỉ lệ % kiến thức: 25% nửa đầu học kì + 75% nửa sau học kì
                 • Dựa vào số tiết dạy để tính trọng số từng đơn vị kiến thức
                 • Ví dụ: Chủ đề A (nửa đầu: 5 tiết, nửa sau: 15 tiết) → Trọng số = (5×0.25 + 15×0.75)/20 = 62.5%
            - Tự động tính số lượng câu hỏi phù hợp với ${time} phút.
            3. ĐỘ KHÓ VÀ PHÂN BỔ MỨC ĐỘ:
           - Mỗi chủ đề phải có ít nhất 20% câu hỏi ở mức Vận dụng
           - Phân bổ mức độ: Biết (30-40%), Hiểu (30-40%), Vận dụng (20-30%)
           - Cấu trúc đề: TNKQ (60-70%), Tự luận (30-40%)
            4. NĂNG LỰC ĐÁNH GIÁ:
               - Mỗi chủ đề phải đánh giá ít nhất 1 năng lực chuyên biệt
               - Mã năng lực:
                 • NL: THTN = Tìm hiểu tự nhiên
                 • NL: GQVĐ = Giải quyết vấn đề
                 • NL: MĐKH = Mô tả và giải thích hiện tượng
                 • NL: GTKH = Giao tiếp khoa học
                 • NL: SDCN = Sử dụng công cụ và ngôn ngữ khoa học
            5. LIÊN KẾT VÀ KIỂM TRA:
               - Mỗi câu hỏi trong đề phải có mã tham chiếu đến ô trong ma trận (Ví dụ: Câu 1 [M1-B])
               - Kiểm tra chéo: Tổng điểm ma trận = Tổng điểm bản đặc tả = 10 điểm
               - Số câu hỏi trong đề = Số câu trong ma trận
            6. TÍNH TOÁN THỜI LƯỢNG - SỐ CÂU:
               - 45 phút: 25-30 câu (18-22 TN + 2-3 TL)
               - 60 phút: 30-35 câu (22-26 TN + 3-4 TL)
               - 90 phút: 35-40 câu (26-30 TN + 4-5 TL)
               - Mỗi câu TNKQ: 0.25-0.5 điểm
               - Mỗi câu Tự luận: 1.0-2.0 điểm
            `;

            // --- STREAMING RESPONSE (QUAN TRỌNG ĐỂ TRÁNH TIMEOUT 524) ---
            const { stream } = await model.generateContentStream(prompt);

            const readableStream = new ReadableStream({
                async start(controller) {
                    try {
                        for await (const chunk of stream) {
                            const chunkText = chunk.text();
                            controller.enqueue(new TextEncoder().encode(chunkText));
                        }
                        // Trừ tiền (Sau khi stream thành công)
                        if (env.TEST_TOOL && license_key) {
                            const creditStr = await env.TEST_TOOL.get(license_key);
                            if (creditStr) {
                                let current = parseInt(creditStr);
                                if (current > 0) await env.TEST_TOOL.put(license_key, (current - 1).toString());
                            }
                        }
                        controller.close();
                    } catch (e) {
                        controller.error(e);
                    }
                }
            });

            return new Response(readableStream, {
                headers: {
                    ...corsHeaders,
                    "Content-Type": "text/html; charset=utf-8", 
                    "Cache-Control": "no-cache",
                    "Connection": "keep-alive"
                }
            });

        } catch (error) {
            return new Response(JSON.stringify({ error: `Lỗi AI: ${error.message}` }), { status: 500, headers: corsHeaders });
        }
    }
}



