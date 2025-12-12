// File: public/js/app.js

// --- KHAI BÁO BIẾN TOÀN CỤC ---
window.generatedHTML = "";

document.addEventListener('DOMContentLoaded', () => {
    console.log("App đã khởi động...");

    // 1. Khởi tạo giao diện
    addTopic();

    // 2. Gán sự kiện cho các nút chính
    const btnGen = document.getElementById('btnGenerate');
    const btnDown = document.getElementById('btnDownloadWord');
    const btnAddTopic = document.getElementById('btnAddTopic');
    const examTypeSelect = document.getElementById('exam_type');
    const btnCopy = document.getElementById('btnCopy'); // Nút Copy
    
    if (btnAddTopic) btnAddTopic.addEventListener('click', addTopic);
    if (btnGen) btnGen.addEventListener('click', handleGenerate);
    if (btnDown) btnDown.addEventListener('click', handleDownloadWord);
    if (btnCopy) btnCopy.addEventListener('click', handleCopyContent);

    // 3. Logic ẩn hiện ô nhập tiết khi đổi loại kỳ thi
    if (examTypeSelect) {
        examTypeSelect.addEventListener('change', updatePeriodInputs);
        setTimeout(updatePeriodInputs, 100); 
    }

    // 4. Sự kiện ủy quyền (Xử lý các nút Xóa/Thêm bài học được tạo động)
    const topicsContainer = document.getElementById('topics-container');
    if (topicsContainer) {
        topicsContainer.addEventListener('click', function(e) {
            const target = e.target;
            // Xóa Chủ đề lớn
            if (target.closest('.remove-topic-btn')) {
                if(confirm("Bạn có chắc muốn xóa chương này không?")) {
                    target.closest('.topic-wrapper').remove();
                }
            } 
            // Thêm bài học con
            else if (target.closest('.btn-add-unit')) {
                addUnit(target.closest('.topic-wrapper').querySelector('.units-container'));
            } 
            // Xóa bài học con
            else if (target.closest('.remove-unit-btn')) {
                target.closest('.unit-item').remove();
            }
        });
    }
});

// --- CÁC HÀM GIAO DIỆN (UI) ---

function updatePeriodInputs() {
    const type = document.getElementById('exam_type').value; 
    document.querySelectorAll('.unit-item').forEach(item => {
        const div1 = item.querySelector('.hk-input-1');
        const input1 = item.querySelector('.unit-p1');
        const div2 = item.querySelector('.hk-input-2');

        if (type === 'hk') {
            // Chế độ Học kì: Hiện cả 2 ô
            div1.classList.remove('hidden'); 
            input1.placeholder = "Tiết (Đầu)";
            div2.classList.remove('hidden');
        } else {
            // Chế độ Giữa kì: Chỉ hiện 1 ô tổng tiết
            div1.classList.remove('hidden'); 
            input1.placeholder = "Tổng tiết";
            div2.classList.add('hidden');
        }
    });
}

function addTopic() {
    const container = document.getElementById('topics-container');
    const template = document.getElementById('topic-template');
    if (!container || !template) return;
    
    const clone = template.content.cloneNode(true);
    const unitsContainer = clone.querySelector('.units-container');
    container.appendChild(clone);
    
    // Thêm sẵn 1 bài học con cho tiện
    addUnit(unitsContainer);
}

function addUnit(container) {
    const template = document.getElementById('unit-template');
    if (!container || !template) return;
    
    const clone = template.content.cloneNode(true);
    container.appendChild(clone);
    
    // Cập nhật lại trạng thái ô nhập tiết cho dòng mới
    updatePeriodInputs();
}

// --- HÀM TẠO DỮ LIỆU (GỌI API) ---
async function handleGenerate() {
    const btn = document.getElementById('btnGenerate');
    const loading = document.getElementById('loadingMsg');
    const error = document.getElementById('errorMsg');
    const sec = document.getElementById('previewSection');
    const prev = document.getElementById('previewContent');

    // Reset giao diện
    loading.classList.remove('hidden'); 
    error.classList.add('hidden');
    error.innerText = ""; 
    sec.classList.add('hidden'); 
    prev.innerHTML = ""; 
    btn.disabled = true;

    try {
        const get = id => document.getElementById(id).value.trim();
        const licenseKey = get('license_key');
        
        if (!licenseKey) throw new Error("Vui lòng nhập Mã Kích Hoạt!");

        // Thu thập dữ liệu từ các ô nhập lồng nhau
        const topicsData = [];
        let totalP1 = 0, totalP2 = 0;

        document.querySelectorAll('.topic-wrapper').forEach(topicEl => {
            const topicName = topicEl.querySelector('.topic-name').value.trim();
            if (!topicName) return; // Bỏ qua nếu tên chương trống
            
            const units = [];
            topicEl.querySelectorAll('.unit-item').forEach(unitEl => {
                const content = unitEl.querySelector('.unit-content').value.trim();
                const p1 = parseInt(unitEl.querySelector('.unit-p1').value) || 0;
                const p2 = parseInt(unitEl.querySelector('.unit-p2').value) || 0;
                
                if (content) {
                    units.push({ content, p1, p2 });
                    totalP1 += p1; 
                    totalP2 += p2;
                }
            });
            
            if (units.length > 0) {
                topicsData.push({ name: topicName, units: units });
            }
        });

        if (topicsData.length === 0) throw new Error("Vui lòng nhập ít nhất 1 Chương và 1 Bài học!");

        // Tạo payload gửi đi
        const requestData = {
            license_key: licenseKey, 
            subject: get('subject'), 
            grade: get('grade'),
            book_series: document.getElementById('book_series').value,
            semester: get('semester'), 
            exam_type: get('exam_type'), 
            time: get('time_limit'),
            use_short_answer: document.getElementById('use_short').checked,
            totalPeriodsHalf1: totalP1, 
            totalPeriodsHalf2: totalP2, 
            topics: topicsData // Cấu trúc mới: Mảng lồng nhau
        };

        // Gọi API
        const res = await fetch('/api_matrix', {
            method: 'POST', 
            headers: {'Content-Type':'application/json'}, 
            body: JSON.stringify(requestData)
        });
        
        if(!res.ok) {
            let t = await res.text(); 
            try { t = JSON.parse(t).error } catch(e){} 
            throw new Error(`Lỗi Server: ${t}`);
        }

        // Đọc Stream trả về
        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let fullHTML = "";
        
        while(true) {
            const {done, value} = await reader.read();
            if(done) break;
            fullHTML += decoder.decode(value, {stream:true});
        }
        
        // Làm sạch HTML
        let cleanHTML = fullHTML.replace(/```html/g, '').replace(/```/g, '').trim();
        // Fix hiển thị các đáp án trắc nghiệm cho đẹp trên web
        cleanHTML = cleanHTML.replace(/(\s+)(B\.|C\.|D\.)/g, '<br><b>$2</b>').replace(/(A\.)/g, '<b>$1</b>');

        // Hiển thị kết quả
        prev.innerHTML = cleanHTML;
        window.generatedHTML = cleanHTML;
        sec.classList.remove('hidden'); 
        sec.scrollIntoView({behavior:'smooth'});

    } catch(e) { 
        error.innerHTML = `<strong>⚠️ Lỗi:</strong> ${e.message}`; 
        error.classList.remove('hidden'); 
    } finally { 
        loading.classList.add('hidden'); 
        btn.disabled = false; 
    }
}

// --- HÀM XỬ LÝ COPY (Đã bổ sung) ---
async function handleCopyContent() {
    const content = document.getElementById('previewContent');
    const btn = document.getElementById('btnCopy');

    if (!window.generatedHTML) {
        alert("Chưa có nội dung để sao chép!");
        return;
    }

    try {
        const type = "text/html";
        const blob = new Blob([window.generatedHTML], { type });
        const data = [new ClipboardItem({ [type]: blob })];
        await navigator.clipboard.write(data);

        // Hiệu ứng nút bấm
        const originalHtml = btn.innerHTML;
        btn.classList.add('copied');
        btn.innerHTML = `<i class="fas fa-check"></i> <span>Đã chép!</span>`;
        setTimeout(() => {
            btn.classList.remove('copied');
            btn.innerHTML = originalHtml;
        }, 2000);

    } catch (err) {
        // Fallback cho trình duyệt cũ
        try {
            const selection = window.getSelection();
            const range = document.createRange();
            range.selectNodeContents(content);
            selection.removeAllRanges();
            selection.addRange(range);
            document.execCommand('copy');
            selection.removeAllRanges();
            alert("Đã sao chép nội dung!");
        } catch(e) {
            alert("Không thể tự động sao chép. Vui lòng bôi đen và nhấn Ctrl+C.");
        }
    }
}

// --- LOGIC XUẤT WORD (DOCX) ---
async function handleDownloadWord() {
    if(!window.generatedHTML) { alert("Chưa có nội dung!"); return; }
    if (typeof docx === 'undefined') { alert("Đang tải thư viện Word, vui lòng đợi 2 giây rồi bấm lại!"); return; }

    const btn = document.getElementById('btnDownloadWord');
    const oldText = btn.innerText;
    btn.innerText = "Đang tạo file..."; 
    btn.disabled = true;

    try {
        const { Document, Packer, Paragraph, Table, TableCell, TableRow, WidthType, TextRun, HeadingLevel, AlignmentType, BorderStyle } = window.docx;

        // Hàm chuyển đổi DOM Node sang Docx Element
        function processNode(node) {
            if (node.nodeType === 3) { // Text node
                return new TextRun(node.nodeValue);
            }
            if (node.nodeType === 1) { // Element node
                const tag = node.tagName.toLowerCase();
                
                if (tag === 'b' || tag === 'strong') return new TextRun({ text: node.innerText, bold: true });
                if (tag === 'i' || tag === 'em') return new TextRun({ text: node.innerText, italics: true });
                if (tag === 'br') return new TextRun({ text: "\n", break: 1 });
                
                // Nếu là thẻ P hoặc DIV chứa text
                if (tag === 'p' || tag === 'div') {
                    const children = Array.from(node.childNodes).map(processNode).flat();
                    return new Paragraph({ children: children });
                }
                
                // Nếu là TABLE
                if (tag === 'table') {
                    const rows = Array.from(node.querySelectorAll('tr')).map(tr => {
                        const cells = Array.from(tr.querySelectorAll('td, th')).map(td => {
                            const colspan = td.getAttribute('colspan') || 1;
                            const rowspan = td.getAttribute('rowspan') || 1;
                            return new TableCell({
                                children: [new Paragraph(td.innerText.trim())],
                                columnSpan: parseInt(colspan),
                                rowSpan: parseInt(rowspan),
                                borders: {
                                    top: {style: BorderStyle.SINGLE, size: 1},
                                    bottom: {style: BorderStyle.SINGLE, size: 1},
                                    left: {style: BorderStyle.SINGLE, size: 1},
                                    right: {style: BorderStyle.SINGLE, size: 1},
                                },
                                width: { size: 100, type: WidthType.PERCENTAGE }
                            });
                        });
                        return new TableRow({ children: cells });
                    });
                    return new Table({ rows: rows, width: { size: 100, type: WidthType.PERCENTAGE } });
                }
            }
            return new TextRun("");
        }

        // Parse HTML string sang DOM
        const parser = new DOMParser();
        const docHTML = parser.parseFromString(`<div>${window.generatedHTML}</div>`, 'text/html');
        const root = docHTML.body.firstElementChild;
        
        // Chuyển đổi đơn giản (Lấy Table và Text)
        // Lưu ý: Đây là bản rút gọn. Để xử lý Math phức tạp cần logic temml như bạn có, 
        // nhưng để chạy được ngay ta dùng logic cơ bản này trước.
        const children = [];
        
        // Tiêu đề
        children.push(new Paragraph({
            text: "ĐỀ KIỂM TRA & MA TRẬN",
            heading: HeadingLevel.HEADING_1,
            alignment: AlignmentType.CENTER,
            spacing: { after: 300 }
        }));

        // Quét các thành phần chính
        Array.from(root.childNodes).forEach(node => {
            const el = processNode(node);
            if (Array.isArray(el)) children.push(...el);
            else children.push(el);
        });

        const doc = new Document({ sections: [{ children: children }] });
        const blob = await Packer.toBlob(doc);
        saveAs(blob, `De_Kiem_Tra_${Date.now()}.docx`);

    } catch(e) { 
        alert("Lỗi xuất file: " + e.message); 
        console.error(e); 
    } finally { 
        btn.innerText = oldText; 
        btn.disabled = false; 
    }
}
