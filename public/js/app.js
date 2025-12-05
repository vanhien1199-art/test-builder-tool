// File: public/js/app.js
// Phiên bản: STABLE V4.0 (Final Fix for UI & Logic)

// Biến toàn cục để lưu nội dung HTML phục vụ xuất file Word
var window_generatedHTML = "";

document.addEventListener('DOMContentLoaded', () => {
    console.log("--- APP READY: V4.0 ---");
    
    // 1. Khởi tạo dòng chủ đề đầu tiên mặc định
    addTopicRow();

    // 2. Gán sự kiện cho các nút tĩnh (Nút luôn có trên trang)
    const btnAdd = document.getElementById('btnAddTopic');
    const btnGen = document.getElementById('btnGenerate');
    const btnDown = document.getElementById('btnDownloadWord');
    const examTypeSelect = document.getElementById('exam_type');

    if (btnAdd) btnAdd.addEventListener('click', addTopicRow);
    if (btnGen) btnGen.addEventListener('click', handleGenerate);
    if (btnDown) btnDown.addEventListener('click', handleDownloadWord);

    // 3. Xử lý sự kiện thay đổi loại kiểm tra (Ẩn/Hiện số tiết)
    if (examTypeSelect) {
        examTypeSelect.addEventListener('change', toggleHKFields);
        // Chạy ngay lần đầu để set trạng thái đúng
        toggleHKFields();
    }
});

// --- HÀM TIỆN ÍCH: ẨN/HIỆN SỐ TIẾT ---
function toggleHKFields() {
    const examType = document.getElementById('exam_type');
    if (!examType) return;
    
    const isHK = examType.value === 'hk'; // Kiểm tra xem có phải là Học kì không
    const hkConfig = document.getElementById('hk-config');
    
    // 1. Ẩn/Hiện khối tổng số tiết
    if (hkConfig) {
        hkConfig.classList.toggle('hidden', !isHK);
    }

    // 2. Ẩn/Hiện các ô nhập số tiết trong từng dòng chủ đề
    const allPeriodInputs = document.querySelectorAll('.hk-period-inputs');
    allPeriodInputs.forEach(div => {
        div.classList.toggle('hidden', !isHK);
    });
}

// --- HÀM THÊM DÒNG CHỦ ĐỀ ---
function addTopicRow() {
    const container = document.getElementById('topics-container');
    const template = document.getElementById('topic-template');

    if (!container || !template) {
        console.error("Lỗi HTML: Không tìm thấy topics-container hoặc topic-template");
        return;
    }

    // Clone template
    const clone = template.content.cloneNode(true);
    
    // Tìm nút xóa trong dòng vừa tạo và gán sự kiện click ngay lập tức
    const btnRemove = clone.querySelector('.remove-topic-btn');
    if (btnRemove) {
        btnRemove.addEventListener('click', function(e) {
            // Tìm phần tử cha là .topic-item và xóa nó
            const item = e.target.closest('.topic-item');
            if (item) item.remove();
        });
    }

    // Thêm vào container
    container.appendChild(clone);

    // Cập nhật trạng thái ẩn/hiện số tiết cho dòng mới thêm
    toggleHKFields();
}

// --- HÀM XỬ LÝ CHÍNH: GỌI API ---
async function handleGenerate() {
    const btn = document.getElementById('btnGenerate');
    const loading = document.getElementById('loadingMsg');
    const error = document.getElementById('errorMsg');
    const previewSection = document.getElementById('previewSection');
    const previewContent = document.getElementById('previewContent');

    // 1. Reset giao diện
    loading.classList.remove('hidden'); // Hiện loading
    error.classList.add('hidden');      // Ẩn lỗi cũ
    previewSection.classList.add('hidden'); // Ẩn khung xem trước
    previewContent.innerHTML = "";      // Xóa nội dung cũ
    btn.disabled = true;                // Khóa nút bấm

    try {
        // 2. Lấy và Kiểm tra Mã Kích Hoạt
        const licenseKeyInput = document.getElementById('license_key');
        const licenseKey = licenseKeyInput ? licenseKeyInput.value.trim() : "";
        
        if (!licenseKey) throw new Error("Vui lòng nhập Mã Kích Hoạt (License Key)!");

        // 3. Thu thập dữ liệu từ Form
        const requestData = {
            license_key: licenseKey,
            subject: document.getElementById('subject').value.trim(),
            grade: document.getElementById('grade').value.trim(),
            semester: document.getElementById('semester').value,
            exam_type: document.getElementById('exam_type').value,
            time: document.getElementById('time_limit').value,
            // Kiểm tra checkbox an toàn
            use_short_answer: document.getElementById('use_short') ? document.getElementById('use_short').checked : false,
            totalPeriodsHalf1: parseInt(document.getElementById('total_half1').value) || 0,
            totalPeriodsHalf2: parseInt(document.getElementById('total_half2').value) || 0,
            topics: []
        };

        // Kiểm tra dữ liệu cơ bản
        if (!requestData.subject || !requestData.grade) {
            throw new Error("Vui lòng nhập tên Môn học và Lớp!");
        }

        // 4. Thu thập danh sách chủ đề
        const topicRows = document.querySelectorAll('.topic-item'); // Class của mỗi dòng chủ đề
        topicRows.forEach(row => {
            const nameEl = row.querySelector('.topic-name');
            const contentEl = row.querySelector('.topic-content');
            const p1El = row.querySelector('.topic-period-1');
            const p2El = row.querySelector('.topic-period-2');

            if (nameEl && contentEl) {
                const name = nameEl.value.trim();
                const content = contentEl.value.trim();
                // Lấy số tiết (nếu có)
                const p1 = p1El ? (parseInt(p1El.value) || 0) : 0;
                const p2 = p2El ? (parseInt(p2El.value) || 0) : 0;

                if (name && content) {
                    requestData.topics.push({ name, content, p1, p2 });
                }
            }
        });

        if (requestData.topics.length === 0) throw new Error("Vui lòng nhập ít nhất 1 Chủ đề và Nội dung kiến thức.");

        // 5. GỌI API (STREAMING)
        console.log("Đang gửi yêu cầu tới /api_matrix...");
        const response = await fetch('/api_matrix', { 
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(requestData)
        });

        // Xử lý lỗi HTTP từ Server (400, 403, 500...)
        if (!response.ok) {
            const errText = await response.text();
            let errMsg = errText;
            try { 
                // Cố gắng parse JSON lỗi nếu có
                const jsonErr = JSON.parse(errText);
                if (jsonErr.error) errMsg = jsonErr.error;
            } catch(e){}
            throw new Error(`Lỗi Server (${response.status}): ${errMsg}`);
        }

        // 6. ĐỌC DỮ LIỆU STREAM VỀ
        previewSection.classList.remove('hidden'); // Hiện khung kết quả
        previewSection.scrollIntoView({ behavior: 'smooth' });

        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let fullHtml = "";

        while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            
            const chunk = decoder.decode(value, { stream: true });
            fullHtml += chunk;
            
            // Làm sạch chunk (xóa các thẻ code block nếu AI lỡ trả về)
            // Vì ta yêu cầu AI trả về HTML thuần, nhưng đôi khi nó vẫn bọc ```html
            let cleanChunk = fullHtml.replace(/```html/g, '').replace(/```/g, '');
            
            // Cập nhật giao diện Real-time
            previewContent.innerHTML = cleanChunk;
        }

        // Lưu kết quả cuối cùng để dùng cho nút Tải Word
        window_generatedHTML = previewContent.innerHTML;
        
        // Tắt loading
        loading.classList.add('hidden');

    } catch (err) {
        console.error(err);
        // Hiển thị lỗi
        error.innerHTML = `<strong>⚠️ Đã xảy ra lỗi:</strong> ${err.message}`;
        error.classList.remove('hidden');
        loading.classList.add('hidden');
    } finally {
        // Mở khóa nút bấm
        btn.disabled = false;
    }
}

// --- HÀM XUẤT FILE WORD ---
function handleDownloadWord() {
    if (!window_generatedHTML) { 
        alert("Chưa có nội dung để tải! Vui lòng tạo ma trận trước."); 
        return; 
    }

    // CSS Inline cho file Word (Bắt buộc để hiển thị bảng đẹp)
    const css = `
        <style>
            body { font-family: 'Times New Roman', serif; font-size: 13pt; line-height: 1.3; }
            
            /* Định dạng bảng */
            table { 
                width: 100%; 
                border-collapse: collapse; 
                border: 1pt solid black; 
                margin-bottom: 20px; 
            }
            th, td { 
                border: 1pt solid black; 
                padding: 5px; 
                vertical-align: top; 
                font-size: 11pt; 
            }
            th { 
                background-color: #f0f0f0; 
                font-weight: bold; 
                text-align: center; 
            }
            
            /* Tiêu đề */
            h1, h2, h3, h4 { 
                text-align: center; 
                font-weight: bold; 
                margin-top: 15pt; 
                color: #000; 
            }
            .text-center { text-align: center; }
            .bold { font-weight: bold; }
        </style>
    `;

    const htmlContent = `
        <!DOCTYPE html>
        <html>
        <head>
            <meta charset="utf-8">
            ${css}
        </head>
        <body>
            ${window_generatedHTML}
        </body>
        </html>
    `;

    try {
        if(typeof htmlDocx !== 'undefined') {
            // Chuyển đổi HTML -> Blob Word
            const converted = htmlDocx.asBlob(htmlContent, { 
                orientation: 'landscape', // Khổ ngang cho Ma trận rộng
                margins: { top: 720, right: 720, bottom: 720, left: 720 }
            });
            
            // Lưu file
            saveAs(converted, `Ma_Tran_De_Kiem_Tra_${new Date().getTime()}.docx`);
        } else {
            alert("Lỗi: Thư viện tạo file Word chưa tải xong. Vui lòng F5 tải lại trang.");
        }
    } catch (e) {
        alert("Lỗi khi tạo file: " + e.message);
    }
}
