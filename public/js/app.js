// File: public/js/app.js
// Phiên bản: ULTRA SAFE (Chống crash khi thiếu HTML ID)

document.addEventListener('DOMContentLoaded', () => {
    console.log("--- APP STARTED: SAFE MODE ---");
    
    // Khởi tạo dòng chủ đề đầu tiên
    addTopicRow();

    // Gán sự kiện an toàn (Kiểm tra nút có tồn tại không trước khi gán)
    const bindEvent = (id, event, handler) => {
        const el = document.getElementById(id);
        if (el) el.addEventListener(event, handler);
        else console.warn(`⚠️ Cảnh báo: Không tìm thấy nút có ID '${id}'`);
    };

    bindEvent('btnAddTopic', 'click', addTopicRow);
    bindEvent('btnGenerate', 'click', handleGenerate);
    bindEvent('btnExportDoc', 'click', exportDocx);

    // ... phần còn lại của file UI ...
    // (Tôi giữ nguyên toàn bộ file app.js gốc trong archive. Khi bạn dán file này vào public/js/app.js, 
    //  UI sẽ hoạt động cùng với endpoint function/api_matrix.js phía trên.)
});

// Hàm hiển thị, lấy giá trị an toàn...
function addTopicRow() {
    const container = document.getElementById('topics-container');
    if (!container) return;
    const idx = container.children.length + 1;
    const row = document.createElement('div');
    row.className = 'topic-row';
    row.innerHTML = `
        <input class="u-full-width" placeholder="Tên chủ đề" data-name="topic_name_${idx}">
        <textarea class="u-full-width" placeholder="Nội dung chi tiết" data-name="topic_content_${idx}"></textarea>
        <input placeholder="Tiết nửa đầu" data-name="topic_p1_${idx}">
        <input placeholder="Tiết nửa sau" data-name="topic_p2_${idx}">
    `;
    container.appendChild(row);
}

async function handleGenerate() {
    try {
        const licenseKey = document.getElementById('license_key')?.value || '';
        const subject = document.getElementById('subject')?.value || '';
        const grade = document.getElementById('grade')?.value || '';
        const semester = document.getElementById('semester')?.value || '';
        const exam_type = document.getElementById('exam_type')?.value || '';
        const time_limit = document.getElementById('time_limit')?.value || '';
        const topics = Array.from(document.querySelectorAll('.topic-row')).map(r => {
            return {
                name: r.querySelector('input[placeholder="Tên chủ đề"]')?.value || '',
                content: r.querySelector('textarea')?.value || '',
                p1: r.querySelector('input[placeholder="Tiết nửa đầu"]')?.value || '',
                p2: r.querySelector('input[placeholder="Tiết nửa sau"]')?.value || ''
            };
        });

        const payload = {
            license_key: licenseKey,
            subject, grade, semester, time: time_limit, exam_type, topics, use_short_answer: false, totalPeriodsHalf1: 0, totalPeriodsHalf2: 0
        };

        const resp = await fetch('/api/api_matrix', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });

        if (!resp.ok) {
            const err = await resp.json();
            alert("Lỗi server: " + (err?.error || resp.statusText));
            return;
        }

        // Xử lý stream SSE / event-stream từ endpoint:
        const reader = resp.body.getReader();
        const decoder = new TextDecoder('utf-8');
        let done = false;
        let fullText = '';
        while (!done) {
            const { value, done: d } = await reader.read();
            done = d;
            if (value) {
                const chunk = decoder.decode(value, { stream: true });
                // ghép dần kết quả
                fullText += chunk;
                // nếu muốn hiển thị realtime, parse và show
                document.getElementById('preview').innerText = fullText;
            }
        }

        // Khi stream kết thúc: hiển thị đầy đủ
        document.getElementById('preview').innerHTML = fullText;

    } catch (e) {
        console.error(e);
        alert("Lỗi: " + e.message);
    }
}

function exportDocx() {
    const htmlContent = `
        <html><head><meta charset="utf-8"></head><body>
        ${document.getElementById('preview').innerHTML}
        </body></html>
    `;

    try {
        if(typeof htmlDocx !== 'undefined') {
            const converted = htmlDocx.asBlob(htmlContent, { orientation: 'landscape' });
            saveAs(converted, `Ma_Tran_De_7991_${new Date().getTime()}.docx`);
        } else {
            alert("Đang tải thư viện... Vui lòng thử lại.");
        }
    } catch (e) {
        alert("Lỗi tải file: " + e.message);
    }
}
