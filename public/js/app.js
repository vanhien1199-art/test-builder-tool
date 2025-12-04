// File: public/js/app.js

document.addEventListener('DOMContentLoaded', () => {
    console.log("--- SYSTEM READY: GEMINI 2.0 MODE ---");
    
    // 1. Khởi tạo dòng chủ đề đầu tiên
    addTopicRow();

    // 2. Gán sự kiện (Bọc trong try-catch để không chết code nếu thiếu ID)
    try {
        const btnAdd = document.getElementById('btnAddTopic');
        const btnGen = document.getElementById('btnGenerate');
        const btnDown = document.getElementById('btnDownloadWord');

        if (btnAdd) btnAdd.addEventListener('click', addTopicRow);
        if (btnGen) btnGen.addEventListener('click', handleGenerate);
        if (btnDown) btnDownload.addEventListener('click', handleDownloadWord);
        
        // Xử lý sự kiện đổi loại kiểm tra
        const examTypeSelect = document.getElementById('exam_type');
        if (examTypeSelect) {
            examTypeSelect.addEventListener('change', toggleHKFields);
            toggleHKFields(); // Chạy ngay lần đầu
        }
    } catch (e) {
        console.error("Lỗi khởi tạo sự kiện:", e);
    }
});

// Hàm ẩn/hiện các ô nhập số tiết
function toggleHKFields() {
    const examType = document.getElementById('exam_type');
    if (!examType) return;
    
    const isHK = examType.value === 'hk';
    const hkConfig = document.getElementById('hk-config');
    
    // Ẩn hiện cấu hình chung
    if (hkConfig) {
        hkConfig.style.display = isHK ? 'block' : 'none';
    }

    // Ẩn hiện cấu hình từng dòng
    document.querySelectorAll('.hk-period-inputs').forEach(el => {
        el.style.display = isHK ? 'grid' : 'none'; // Dùng grid để giữ layout đẹp
    });
}

// Hàm thêm dòng chủ đề
function addTopicRow() {
    const container = document.getElementById('topics-container');
    const template = document.getElementById('topic-template');

    if (!container || !template) {
        console.error("Thiếu container hoặc template chủ đề!");
        return;
    }

    const clone = template.content.cloneNode(true);
    
    // Gán sự kiện xóa cho nút trong dòng mới
    const btnRemove = clone.querySelector('.remove-topic-btn');
    if (btnRemove) {
        btnRemove.addEventListener('click', function() {
            this.closest('.topic-row').remove();
        });
    }

    container.appendChild(clone);
    toggleHKFields(); // Cập nhật trạng thái hiển thị cho dòng mới
}

// --- XỬ LÝ CHÍNH ---
async function handleGenerate() {
    const btn = document.getElementById('btnGenerate');
    const loading = document.getElementById('loadingMsg');
    const error = document.getElementById('errorMsg');
    const previewSection = document.getElementById('previewSection');
    const previewContent = document.getElementById('previewContent');

    // Reset giao diện
    if(loading) loading.style.display = 'block';
    if(error) error.style.display = 'none';
    if(previewSection) previewSection.style.display = 'none';
    if(previewContent) previewContent.innerHTML = "";
    if(btn) btn.disabled = true;

    try {
        // 1. Lấy License
        const licenseKey = document.getElementById('license_key').value.trim();
        if (!licenseKey) throw new Error("Vui lòng nhập Mã Kích Hoạt!");

        // 2. Thu thập dữ liệu
        const requestData = {
            license_key: licenseKey,
            subject: document.getElementById('subject').value.trim(),
            grade: document.getElementById('grade').value.trim(),
            semester: document.getElementById('semester').value,
            exam_type: document.getElementById('exam_type').value,
            time: document.getElementById('time_limit').value,
            use_short_answer: document.getElementById('use_short').checked,
            totalPeriodsHalf1: parseInt(document.getElementById('total_half1').value) || 0,
            totalPeriodsHalf2: parseInt(document.getElementById('total_half2').value) || 0,
            topics: []
        };

        // Lấy danh sách chủ đề
        const topicRows = document.querySelectorAll('.topic-row');
        topicRows.forEach(row => {
            const name = row.querySelector('.topic-name').value.trim();
            const content = row.querySelector('.topic-content').value.trim();
            const p1 = parseInt(row.querySelector('.topic-period-1').value) || 0;
            const p2 = parseInt(row.querySelector('.topic-period-2').value) || 0;

            if (name && content) {
                requestData.topics.push({ name, content, p1, p2 });
            }
        });

        if (requestData.topics.length === 0) throw new Error("Vui lòng nhập ít nhất 1 chủ đề.");

        // 3. GỌI API (STREAMING)
        console.log("Đang gọi API...");
        const response = await fetch('/api_matrix', { 
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(requestData)
        });

        if (!response.ok) {
            const errText = await response.text();
            let errMsg = errText;
            try { errMsg = JSON.parse(errText).error; } catch(e){}
            throw new Error(`Lỗi Server (${response.status}): ${errMsg}`);
        }

        // 4. ĐỌC STREAM VÀ HIỂN THỊ
        if(previewSection) {
            previewSection.style.display = 'block';
            previewSection.scrollIntoView({ behavior: 'smooth' });
        }

        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let fullHtml = "";

        while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            
            const chunk = decoder.decode(value, { stream: true });
            fullHtml += chunk;
            
            // Loại bỏ các thẻ code block nếu AI lỡ trả về
            let cleanChunk = fullHtml.replace(/```html/g, '').replace(/```/g, '');
            if(previewContent) previewContent.innerHTML = cleanChunk;
        }

        // Lưu kết quả để tải về
        window.generatedHTML = previewContent.innerHTML;
        if(loading) loading.style.display = 'none';

    } catch (err) {
        console.error(err);
        if(error) {
            error.innerHTML = `<strong>⚠️ Lỗi:</strong> ${err.message}`;
            error.style.display = 'block';
        }
        if(loading) loading.style.display = 'none';
    } finally {
        if(btn) btn.disabled = false;
    }
}

// --- XỬ LÝ TẢI WORD ---
function handleDownloadWord() {
    if (!window.generatedHTML) { alert("Chưa có nội dung!"); return; }

    const css = `
        <style>
            body { font-family: 'Times New Roman', serif; font-size: 13pt; line-height: 1.3; }
            table { width: 100%; border-collapse: collapse; border: 1pt solid black; margin-bottom: 20px; }
            th, td { border: 1pt solid black; padding: 5px; vertical-align: top; font-size: 11pt; }
            th { background-color: #f0f0f0; font-weight: bold; text-align: center; }
            h1, h2, h3, h4 { text-align: center; font-weight: bold; margin-top: 15pt; color: #000; }
        </style>
    `;

    const htmlContent = `
        <!DOCTYPE html>
        <html>
        <head><meta charset="utf-8">${css}</head>
        <body>${window.generatedHTML}</body>
        </html>
    `;

    try {
        if(typeof htmlDocx !== 'undefined') {
            const converted = htmlDocx.asBlob(htmlContent, { 
                orientation: 'landscape',
                margins: { top: 720, right: 720, bottom: 720, left: 720 }
            });
            saveAs(converted, `Ma_Tran_De_7991_${new Date().getTime()}.docx`);
        } else {
            alert("Lỗi: Thư viện Word chưa tải xong. Vui lòng F5 và thử lại.");
        }
    } catch (e) {
        alert("Lỗi tải file: " + e.message);
    }
}
