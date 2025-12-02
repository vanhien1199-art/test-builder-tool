// File: public/js/app.js

document.addEventListener('DOMContentLoaded', () => {
    addTopicRow(); // Thêm 1 dòng chủ đề mặc định

    document.getElementById('btnAddTopic').addEventListener('click', addTopicRow);
    document.getElementById('btnGenerate').addEventListener('click', handleGenerate);
    document.getElementById('btnDownloadWord').addEventListener('click', handleDownloadWord);
});

function addTopicRow() {
    const container = document.getElementById('topics-container');
    const template = document.getElementById('topic-template');
    const clone = template.content.cloneNode(true);
    container.appendChild(clone);
}

// XỬ LÝ CHÍNH: STREAMING
async function handleGenerate() {
    const btn = document.getElementById('btnGenerate');
    const loading = document.getElementById('loadingMsg');
    const error = document.getElementById('errorMsg');
    const previewSection = document.getElementById('previewSection');
    const previewContent = document.getElementById('previewContent');

    loading.style.display = 'block';
    loading.innerText = "AI đang suy nghĩ và viết từng dòng...";
    error.style.display = 'none';
    previewSection.style.display = 'none';
    previewContent.innerHTML = ""; // Xóa cũ
    btn.disabled = true;

    try {
        const licenseKey = document.getElementById('license_key').value.trim();
        if (!licenseKey) throw new Error("Vui lòng nhập Mã Kích Hoạt!");

        const requestData = {
            license_key: licenseKey,
            subject: document.getElementById('subject').value.trim(),
            grade: document.getElementById('grade').value.trim(),
            semester: document.getElementById('semester').value,
            exam_type: 'hk', // Mặc định hoặc lấy từ select nếu có
            time: document.getElementById('time_limit').value,
            totalPeriodsHalf1: parseInt(document.getElementById('total_half1').value) || 0,
            totalPeriodsHalf2: parseInt(document.getElementById('total_half2').value) || 0,
            topics: []
        };

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

        // GỌI API STREAMING
        const response = await fetch('/api_matrix', { 
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(requestData)
        });

        if (!response.ok) {
            const errText = await response.text();
            throw new Error(`Lỗi Server ${response.status}: ${errText}`);
        }

        // Hiện khung trước để người dùng thấy chữ chạy
        previewSection.style.display = 'block';
        previewSection.scrollIntoView({ behavior: 'smooth' });

        // Đọc Stream
        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let fullMarkdown = "";

        while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            
            const chunk = decoder.decode(value, { stream: true });
            fullMarkdown += chunk;
            
            // Cập nhật giao diện realtime (dùng marked để render)
            if(typeof marked !== 'undefined') {
                previewContent.innerHTML = marked.parse(fullMarkdown);
            } else {
                previewContent.innerText = fullMarkdown;
            }
        }

        // Lưu kết quả cuối cùng
        window.generatedHTML = previewContent.innerHTML;
        loading.style.display = 'none';

    } catch (err) {
        error.innerHTML = `<strong>⚠️ Lỗi:</strong> ${err.message}`;
        error.style.display = 'block';
        loading.style.display = 'none';
    } finally {
        btn.disabled = false;
    }
}

function handleDownloadWord() {
    if (!window.generatedHTML) { alert("Chưa có nội dung!"); return; }

    const htmlContent = `
        <!DOCTYPE html>
        <html>
        <head>
            <meta charset="utf-8">
            <style>
                body { font-family: 'Times New Roman', serif; font-size: 13pt; line-height: 1.3; }
                table { width: 100%; border-collapse: collapse; margin-bottom: 20px; }
                th, td { border: 1px solid black; padding: 5px; vertical-align: top; }
                h1, h2, h3, h4 { text-align: center; font-weight: bold; margin-top: 10px; }
            </style>
        </head>
        <body>
            ${window.generatedHTML}
        </body>
        </html>
    `;

    try {
        if(typeof htmlDocx !== 'undefined') {
            const converted = htmlDocx.asBlob(htmlContent, { orientation: 'landscape' });
            saveAs(converted, `Ma_Tran_De_7991_${new Date().getTime()}.docx`);
        } else {
            alert("Đang tải thư viện tạo Word... Vui lòng đợi và bấm lại sau vài giây.");
        }
    } catch (e) {
        alert("Lỗi tạo file: " + e.message);
    }
}
