// File: public/js/app.js

document.addEventListener('DOMContentLoaded', () => {
    // Thêm 1 dòng chủ đề mặc định
    addTopicRow();

    document.getElementById('btnAddTopic').addEventListener('click', addTopicRow);
    document.getElementById('btnGenerate').addEventListener('click', handleGenerate);
    document.getElementById('btnDownloadWord').addEventListener('click', handleDownloadWord);
});

// Thêm dòng nhập liệu chủ đề
function addTopicRow() {
    const container = document.getElementById('topics-container');
    const template = document.getElementById('topic-template');
    const clone = template.content.cloneNode(true);
    container.appendChild(clone);
}

// XỬ LÝ CHÍNH
async function handleGenerate() {
    const btn = document.getElementById('btnGenerate');
    const loading = document.getElementById('loadingMsg');
    const error = document.getElementById('errorMsg');
    const previewSection = document.getElementById('previewSection');
    const previewContent = document.getElementById('previewContent');

    // Reset UI
    loading.style.display = 'block';
    error.style.display = 'none';
    previewSection.style.display = 'none';
    btn.disabled = true;

    try {
        // 1. Thu thập dữ liệu
        const licenseKey = document.getElementById('license_key').value.trim();
        if (!licenseKey) throw new Error("Vui lòng nhập Mã Kích Hoạt!");

        const requestData = {
            license_key: licenseKey,
            subject: document.getElementById('subject').value.trim(),
            grade: document.getElementById('grade').value.trim(),
            semester: document.getElementById('semester').value,
            time: document.getElementById('time_limit').value,
            totalPeriodsHalf1: parseInt(document.getElementById('total_half1').value) || 0,
            totalPeriodsHalf2: parseInt(document.getElementById('total_half2').value) || 0,
            topics: []
        };

        if(requestData.totalPeriodsHalf1 <= 0 || requestData.totalPeriodsHalf2 <= 0) {
            throw new Error("Vui lòng nhập Tổng số tiết hợp lệ (lớn hơn 0).");
        }

        // Duyệt qua danh sách chủ đề
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

        // 2. Gọi API
        const response = await fetch('/api_matrix', { // Gọi endpoint mới
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(requestData)
        });

        const rawText = await response.text();
        
        if (response.status !== 200) {
            let errMsg = rawText;
            try { errMsg = JSON.parse(rawText).error; } catch(e){}
            throw new Error(errMsg);
        }

        const data = JSON.parse(rawText);
        const markdownResult = data.result;

        // 3. Hiển thị kết quả (Dùng Marked để chuyển MD sang HTML)
        previewContent.innerHTML = marked.parse(markdownResult);
        previewSection.style.display = 'block';
        previewSection.scrollIntoView({ behavior: 'smooth' });

        // Lưu nội dung HTML để xuất Word
        window.generatedHTML = previewContent.innerHTML;

    } catch (err) {
        error.textContent = "⚠️ Lỗi: " + err.message;
        error.style.display = 'block';
    } finally {
        loading.style.display = 'none';
        btn.disabled = false;
    }
}

// XUẤT FILE WORD
function handleDownloadWord() {
    if (!window.generatedHTML) {
        alert("Chưa có nội dung để tải!");
        return;
    }

    // Tạo nội dung HTML chuẩn cho Word
    const htmlContent = `
        <!DOCTYPE html>
        <html>
        <head>
            <meta charset="utf-8">
            <style>
                body { font-family: 'Times New Roman', serif; font-size: 13pt; line-height: 1.5; }
                table { width: 100%; border-collapse: collapse; margin-bottom: 20px; }
                th, td { border: 1px solid black; padding: 5px; vertical-align: top; }
                h1, h2, h3 { text-align: center; }
                .text-center { text-align: center; }
                .text-bold { font-weight: bold; }
            </style>
        </head>
        <body>
            ${window.generatedHTML}
        </body>
        </html>
    `;

    // Sử dụng thư viện html-docx-js để convert
    // Lưu ý: Thư viện này chạy tốt nhất qua CDN đã khai báo ở index.html
    try {
        const converted = htmlDocx.asBlob(htmlContent);
        saveAs(converted, `De_Kiem_Tra_${new Date().getTime()}.docx`);
    } catch (e) {
        alert("Lỗi khi tạo file Word: " + e.message);
    }
}