// File: public/js/app.js

document.addEventListener('DOMContentLoaded', () => {
    addTopicRow(); // Thêm 1 dòng chủ đề mặc định

    document.getElementById('btnAddTopic').addEventListener('click', addTopicRow);
    document.getElementById('btnGenerate').addEventListener('click', handleGenerate);
    document.getElementById('btnDownloadWord').addEventListener('click', handleDownloadWord);

    // Xử lý ẩn/hiện cột số tiết khi chọn loại đề
    document.getElementById('exam_type').addEventListener('change', function() {
        const isHK = this.value === 'hk';
        document.querySelectorAll('.hk-only').forEach(el => {
            el.style.display = isHK ? 'block' : 'none';
        });
    });
});

function addTopicRow() {
    const container = document.getElementById('topics-container');
    const template = document.getElementById('topic-template');
    const clone = template.content.cloneNode(true);
    container.appendChild(clone);
    
    // Cập nhật trạng thái hiển thị theo loại đề hiện tại
    const isHK = document.getElementById('exam_type').value === 'hk';
    const newRow = container.lastElementChild;
    // (Logic ẩn hiện cột số tiết sẽ tự áp dụng qua CSS hoặc event change)
}

async function handleGenerate() {
    const btn = document.getElementById('btnGenerate');
    const loading = document.getElementById('loadingMsg');
    const error = document.getElementById('errorMsg');
    const previewSection = document.getElementById('previewSection');
    const previewContent = document.getElementById('previewContent');

    loading.style.display = 'block';
    error.style.display = 'none';
    previewSection.style.display = 'none';
    btn.disabled = true;

    try {
        const licenseKey = document.getElementById('license_key').value.trim();
        if (!licenseKey) throw new Error("Vui lòng nhập Mã Kích Hoạt!");

        const requestData = {
            license_key: licenseKey,
            subject: document.getElementById('subject').value.trim(),
            grade: document.getElementById('grade').value.trim(),
            semester: document.getElementById('semester').value,
            exam_type: document.getElementById('exam_type').value, // 'gk' hoặc 'hk'
            time: document.getElementById('time_limit').value,
            use_short_answer: document.getElementById('use_short').checked, // Checkbox
            topics: []
        };

        // Thu thập chủ đề
        const topicRows = document.querySelectorAll('.topic-row');
        topicRows.forEach(row => {
            const name = row.querySelector('.topic-name').value.trim();
            const content = row.querySelector('.topic-content').value.trim();
            // Nếu là HK thì lấy số tiết, nếu GK thì mặc định 0
            const p1 = parseInt(row.querySelector('.topic-period-1').value) || 0;
            const p2 = parseInt(row.querySelector('.topic-period-2').value) || 0;

            if (name && content) {
                requestData.topics.push({ name, content, p1, p2 });
            }
        });

        if (requestData.topics.length === 0) throw new Error("Vui lòng nhập ít nhất 1 chủ đề.");

        // Gọi API
        const response = await fetch('/api_matrix', { 
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

        // Render HTML
        if(typeof marked !== 'undefined') {
            previewContent.innerHTML = marked.parse(markdownResult);
        } else {
            previewContent.innerText = markdownResult;
        }

        window.generatedHTML = previewContent.innerHTML;
        previewSection.style.display = 'block';
        previewSection.scrollIntoView({ behavior: 'smooth' });

    } catch (err) {
        error.innerHTML = `<strong>⚠️ Lỗi:</strong> ${err.message}`;
        error.style.display = 'block';
    } finally {
        loading.style.display = 'none';
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
                body { font-family: 'Times New Roman', serif; font-size: 13pt; line-height: 1.5; }
                table { width: 100%; border-collapse: collapse; margin-bottom: 20px; }
                th, td { border: 1px solid black; padding: 5px; vertical-align: top; }
                h1, h2, h3, h4 { text-align: center; font-weight: bold; }
            </style>
        </head>
        <body>
            ${window.generatedHTML}
        </body>
        </html>
    `;

    try {
        const converted = htmlDocx.asBlob(htmlContent, { orientation: 'landscape' });
        saveAs(converted, `Ma_Tran_De_7991_${new Date().getTime()}.docx`);
    } catch (e) {
        alert("Lỗi tạo file: " + e.message);
    }
}
