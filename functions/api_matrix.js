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
                scoreLogic = `*LƯU Ý PHÂN BỐ ĐIỂM (CUỐI KÌ): Tổng tiết Nửa đầu HK: ${totalPeriodsHalf1}, Nửa sau HK: ${totalPeriodsHalf2}. Phân bổ điểm tỷ lệ Hãy tính tỉ lệ điểm dựa trên trọng số này: Nửa đầu ~25%, Nửa sau ~75%.`;
            } else {
                scoreLogic = `*LƯU Ý PHÂN BỐ ĐIỂM (GIỮA KÌ): Tổng số tiết: ${totalPeriodsHalf1}. Tính % điểm dựa trên số tiết từng bài.`;
            }

            // --- PROMPT FINAL ---
            const prompt = `
           BẠN LÀ MỘT HỆ THỐNG TÍNH TOÁN và NHẬP LIỆU TỰ ĐỘNG cho ma trận đề thi. Bạn KHÔNG được suy diễn, KHÔNG được bỏ qua bước nào. Thực hiện TUẦN TỰ theo các bước dưới đây.

## THÔNG TIN ĐẦU VÀO:
- Môn: ${subject} - Lớp ${grade} - Bộ sách: ${book_series}
- Loại đề: ${exam_type === 'hk' ? 'HỌC KỲ' : 'GIỮA KỲ'} ${semester}
- Thời gian: ${time} phút
- ${use_short_answer ? 'CÓ sử dụng câu Trả lời ngắn' : 'KHÔNG sử dụng câu Trả lời ngắn (chỉ MCQ + Tự luận)'}
- Tổng số bài/đơn vị kiến thức: ${topics.reduce((sum, topic) => sum + topic.units.length, 0)}

## BƯỚC 1: XÁC ĐỊNH CẤU TRÚC ĐỀ (CỐ ĐỊNH)
Dựa vào thời gian ${time} phút, chọn 1 trong 2 cấu trúc sau:

${
  time >= 60 
  ? `**CẤU TRÚC CHO ${time} PHÚT (>=60 phút):**
     - MCQ: 12 câu × 0.25đ = 3.0 điểm
     - Đúng-Sai: 2 câu chùm × 1.0đ/chùm = 2.0 điểm
     - Trả lời ngắn: 4 câu × 0.5đ = 2.0 điểm
     - Tự luận: 3.0 điểm (2-3 câu, VD: 1.5 + 1.0 + 0.5)
     → Tổng: 10.0 điểm`
  : `**CẤU TRÚC CHO ${time} PHÚT (45 phút):**
     - MCQ: 6 câu × 0.5đ = 3.0 điểm
     - Đúng-Sai: 1 câu chùm × 2.0đ/chùm = 2.0 điểm
     - Trả lời ngắn: 4 câu × 0.5đ = 2.0 điểm
     - Tự luận: 3.0 điểm (2 câu, VD: 2.0 + 1.0)
     → Tổng: 10.0 điểm`
}

## BƯỚC 2: TÍNH TOÁN PHÂN BỔ ĐIỂM CHO TỪNG BÀI HỌC

### 2.1 Tính % điểm cho mỗi bài học:
${
  exam_type === 'gk'
  ? `**Đề giữa kỳ:** Công thức: %Điểm_bài = (Số tiết của bài / ${totalPeriodsHalf1}) × 100%`
  : `**Đề học kỳ:** 
     1. Nửa đầu (25% trọng số): %Điểm_nửa_đầu = (Số tiết p1 của bài / ${totalPeriodsHalf1}) × 25%
     2. Nửa sau (75% trọng số): %Điểm_nửa_sau = (Số tiết p2 của bài / ${totalPeriodsHalf2}) × 75%
     3. %Điểm_bài = %Điểm_nửa_đầu + %Điểm_nửa_sau`
}

### 2.2 Chuyển % điểm thành SỐ CÂU HỎI:
Áp dụng công thức sau cho TỪNG LOẠI câu hỏi:
- Số câu MCQ = (Tổng số câu MCQ) × (%Điểm_bài / 100)
- Số câu Đúng-Sai = (Tổng số câu Đ-S) × (%Điểm_bài / 100)
- Số câu Trả lời ngắn = (Tổng số câu TLN) × (%Điểm_bài / 100)
- Số câu Tự luận = (Tổng số câu TL) × (%Điểm_bài / 100)

**LÀM TRÒN NGUYÊN TẮC:**
1. Làm tròn 2 chữ số thập phân
2. Tổng số câu mỗi loại phải bằng số quy định (MCQ: ${time >= 60 ? '12' : '6'}, Đ-S: ${time >= 60 ? '2' : '1'}, TLN: 4, TL: ${time >= 60 ? '2-3' : '2'})
3. Nếu thiếu câu, thêm vào bài có % cao nhất
4. Nếu thừa câu, bớt ở bài có % thấp nhất

### 2.3 Phân bổ câu hỏi vào 3 mức độ (Biết/Hiểu/Vận dụng):
**NGUYÊN TẮC BẮT BUỘC:**
1. Mỗi bài học PHẢI có đủ 3 mức độ
2. Tỉ lệ chung toàn đề: Biết ~40%, Hiểu ~30%, Vận dụng ~30%
3. Trong mỗi bài, phân bổ đồng đều các mức độ cho các loại câu hỏi

**CÔNG THỨC CHO MỖI BÀI:**
- Tổng số câu bài = Số câu MCQ + Số câu Đ-S + Số câu TLN + Số câu TL
- Số câu mức Biết = (40% × Tổng số câu bài) → làm tròn lên/xuống
- Số câu mức Hiểu = (30% × Tổng số câu bài) → làm tròn
- Số câu mức Vận dụng = Tổng số câu bài - (Biết + Hiểu)

## BƯỚC 3: ĐIỀN VÀO MA TRẬN HTML

### 3.1 Cấu trúc bảng (19 cột):
<table border="1">
<tr>
  <th rowspan="4">TT</th>
  <th rowspan="4">Chủ đề/Chương</th>
  <th rowspan="4">Nội dung/đơn vị kiến thức</th>
  <th colspan="12">Mức độ đánh giá</th>
  <th colspan="3">Tổng</th>
  <th rowspan="4">Tỉ lệ % điểm</th>
</tr>
<tr>
  <th colspan="9">TNKQ</th>
  <th colspan="3">Tự luận</th>
</tr>
<tr>
  <th colspan="3">Nhiều lựa chọn</th>
  <th colspan="3">Đúng - Sai</th>
  <th colspan="3">Trả lời ngắn</th>
  <th colspan="3">Tự luận</th>
</tr>
<tr>
  <th>Biết</th><th>Hiểu</th><th>Vận dụng</th>
  <th>Biết</th><th>Hiểu</th><th>Vận dụng</th>
  <th>Biết</th><th>Hiểu</th><th>Vận dụng</th>
  <th>Biết</th><th>Hiểu</th><th>Vận dụng</th>
  <th>Biết</th><th>Hiểu</th><th>Vận dụng</th>
</tr>

### 3.2 Điền từng dòng (cho mỗi bài học):
${topics.map((topic, tIndex) => 
  topic.units.map((unit, uIndex) => {
    const unitIndex = tIndex * 100 + uIndex;
    return `
<!-- Dòng cho ${unit.content} -->
<tr>
  <td>${unitIndex + 1}</td>
  <td>${topic.name}</td>
  <td>${unit.content}</td>
  <!-- MCQ: Biết/Hiểu/VD (tính toán từ Bước 2) -->
  <td>[SỐ MCQ-Biết]</td><td>[SỐ MCQ-Hiểu]</td><td>[SỐ MCQ-VD]</td>
  <!-- Đúng-Sai: Biết/Hiểu/VD -->
  <td>[SỐ ĐS-Biết]</td><td>[SỐ ĐS-Hiểu]</td><td>[SỐ ĐS-VD]</td>
  <!-- Trả lời ngắn: Biết/Hiểu/VD -->
  <td>[SỐ TLN-Biết]</td><td>[SỐ TLN-Hiểu]</td><td>[SỐ TLN-VD]</td>
  <!-- Tự luận: Biết/Hiểu/VD -->
  <td>[SỐ TL-Biết]</td><td>[SỐ TL-Hiểu]</td><td>[SỐ TL-VD]</td>
  <!-- Tổng câu theo mức độ (TỰ TÍNH) -->
  <td>[TỔNG Biết = Σ các cột Biết]</td>
  <td>[TỔNG Hiểu = Σ các cột Hiểu]</td>
  <td>[TỔNG VD = Σ các cột Vận dụng]</td>
  <!-- % điểm (từ Bước 2.1) -->
  <td>[%Điểm_bài]%</td>
</tr>`;
  }).join('')
).join('')}

### 3.3 DÒNG TỔNG KẾT (FOOTER) - PHẢI TÍNH ĐÚNG:
<!-- Dòng 1: Tổng số câu -->
<tr>
  <td colspan="3"><strong>Tổng số câu</strong></td>
  <!-- Cộng DỌC tất cả các cột trên -->
  <td>[Σ MCQ-Biết]</td><td>[Σ MCQ-Hiểu]</td><td>[Σ MCQ-VD]</td>
  <td>[Σ ĐS-Biết]</td><td>[Σ ĐS-Hiểu]</td><td>[Σ ĐS-VD]</td>
  <td>[Σ TLN-Biết]</td><td>[Σ TLN-Hiểu]</td><td>[Σ TLN-VD]</td>
  <td>[Σ TL-Biết]</td><td>[Σ TL-Hiểu]</td><td>[Σ TL-VD]</td>
  <td>[TỔNG Biết toàn đề]</td>
  <td>[TỔNG Hiểu toàn đề]</td>
  <td>[TỔNG VD toàn đề]</td>
  <td>100%</td>
</tr>

<!-- Dòng 2: Tổng số điểm -->
<tr>
  <td colspan="3"><strong>Tổng số điểm</strong></td>
  <!-- MCQ: Số câu × điểm/câu -->
  <td colspan="3">${time >= 60 ? '[Σ MCQ] × 0.25 = 3.0' : '[Σ MCQ] × 0.5 = 3.0'}</td>
  <!-- Đúng-Sai: Số câu chùm × điểm/chùm -->
  <td colspan="3">${time >= 60 ? '[Σ Đ-S] × 1.0 = 2.0' : '[Σ Đ-S] × 2.0 = 2.0'}</td>
  <!-- Trả lời ngắn: Số câu × 0.5đ -->
  <td colspan="3">[Σ TLN] × 0.5 = 2.0</td>
  <!-- Tự luận: Tổng điểm đã phân bổ -->
  <td colspan="3">[TỔNG ĐIỂM TL] = 3.0</td>
  <!-- Tổng điểm theo mức độ -->
  <td>[Điểm Biết]</td>
  <td>[Điểm Hiểu]</td>
  <td>[Điểm Vận dụng]</td>
  <td><strong>10.0</strong></td>
</tr>

<!-- Dòng 3: Tỉ lệ % -->
<tr>
  <td colspan="3"><strong>Tỉ lệ %</strong></td>
  <!-- Chuyển điểm thành % -->
  <td colspan="3">30%</td>
  <td colspan="3">20%</td>
  <td colspan="3">20%</td>
  <td colspan="3">30%</td>
  <td>[%Biết]</td>
  <td>[%Hiểu]</td>
  <td>[%Vận dụng]</td>
  <td>100%</td>
</tr>
</table>

## BƯỚC 4: KIỂM TRA LẠI (BẮT BUỘC)
Trước khi trả kết quả, KIỂM TRA các điều kiện sau:

✅ 1. Tổng câu MCQ = ${time >= 60 ? '12' : '6'}? (Đ/S: [ ])
✅ 2. Tổng câu Đúng-Sai = ${time >= 60 ? '2' : '1'}? (Đ/S: [ ])
✅ 3. Tổng câu Trả lời ngắn = 4? (Đ/S: [ ])
✅ 4. Tổng câu Tự luận = ${time >= 60 ? '2-3' : '2'}? (Đ/S: [ ])
✅ 5. Tổng điểm = 10.0? (Đ/S: [ ])
✅ 6. %Biết ≈ 40%, %Hiểu ≈ 30%, %VD ≈ 30%? (Đ/S: [ ])
✅ 7. Mỗi bài học có đủ 3 mức độ? (Đ/S: [ ])

## BƯỚC 5: TẠO BẢNG ĐẶC TẢ
Tạo bảng đặc tả 16 cột với:
- Cột 1-3: Giống ma trận
- Cột 4: "Yêu cầu cần đạt" (mô tả kiến thức cho từng mức độ)
- Cột 5-16: Copy CHÍNH XÁC số câu từ ma trận (cột D-O)

## BƯỚC 6: TẠO ĐỀ THI & ĐÁP ÁN
Theo cấu trúc đã xác định ở Bước 1.

## LỆNH CUỐI CÙNG:
Thực hiện TUẦN TỰ Bước 1 → Bước 6.
KHÔNG bỏ qua bước nào.
KHÔNG tự ý thay đổi công thức.
Kết quả cuối cùng phải là HTML table hoàn chỉnh.
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

// --- ĐẶT NỘI DUNG VĂN BẢN Ở CUỐI FILE ĐỂ CODE GỌN GÀNG ---
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









