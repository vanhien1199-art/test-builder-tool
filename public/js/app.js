// File: public/js/app.js

// --- KHAI BÁO BIẾN TOÀN CỤC ---
window.generatedHTML = "";

document.addEventListener('DOMContentLoaded', () => {
    // 1. Khởi tạo
    addTopic();

    // 2. Gán sự kiện an toàn (Kiểm tra nút tồn tại mới gán)
    const btnGen = document.getElementById('btnGenerate');
    const btnDown = document.getElementById('btnDownloadWord');
    const btnAddTopic = document.getElementById('btnAddTopic');
    const btnCopy = document.getElementById('btnCopy');
    const examTypeSelect = document.getElementById('exam_type');
    
    if (btnAddTopic) btnAddTopic.addEventListener('click', addTopic);
    if (btnGen) btnGen.addEventListener('click', handleGenerate);
    if (btnDown) btnDown.addEventListener('click', handleDownloadWord);
    if (btnCopy) btnCopy.addEventListener('click', handleCopyContent);

    // 3. Logic ẩn hiện ô nhập tiết
    if (examTypeSelect) {
        examTypeSelect.addEventListener('change', updatePeriodInputs);
        setTimeout(updatePeriodInputs, 100); 
    }

    // 4. Sự kiện ủy quyền
    const topicContainer = document.getElementById('topics-container');
    if (topicContainer) {
        topicContainer.addEventListener('click', function(e) {
            const target = e.target;
            if (target.closest('.remove-topic-btn')) {
                if(confirm("Xóa chương này?")) target.closest('.topic-wrapper').remove();
            } else if (target.closest('.btn-add-unit')) {
                addUnit(target.closest('.topic-wrapper').querySelector('.units-container'));
            } else if (target.closest('.remove-unit-btn')) {
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
            div1.classList.remove('hidden'); input1.placeholder = "Tiết (Đầu)";
            div2.classList.remove('hidden');
        } else {
            div1.classList.remove('hidden'); input1.placeholder = "Tổng tiết";
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
    addUnit(unitsContainer);
}

function addUnit(container) {
    const template = document.getElementById('unit-template');
    if (!container || !template) return;
    const clone = template.content.cloneNode(true);
    container.appendChild(clone);
    updatePeriodInputs();
}

// --- HÀM TẠO DỮ LIỆU ---
async function handleGenerate() {
    const btn = document.getElementById('btnGenerate');
    const loading = document.getElementById('loadingMsg');
    const error = document.getElementById('errorMsg');
    const sec = document.getElementById('previewSection');
    const prev = document.getElementById('previewContent');

    loading.classList.remove('hidden'); 
    error.innerText = ""; 
    sec.classList.add('hidden'); 
    prev.innerHTML = ""; 
    btn.disabled = true;

    try {
        const get = id => document.getElementById(id).value.trim();
        if (!get('license_key')) throw new Error("Vui lòng nhập Mã Kích Hoạt!");

        const topicsData = [];
        let totalP1 = 0, totalP2 = 0;

        document.querySelectorAll('.topic-wrapper').forEach(topicEl => {
            const topicName = topicEl.querySelector('.topic-name').value.trim();
            if (!topicName) return; 
            const units = [];
            topicEl.querySelectorAll('.unit-item').forEach(unitEl => {
                const content = unitEl.querySelector('.unit-content').value.trim();
                const p1 = parseInt(unitEl.querySelector('.unit-p1').value) || 0;
                const p2 = parseInt(unitEl.querySelector('.unit-p2').value) || 0;
                if (content) {
                    units.push({ content, p1, p2 });
                    totalP1 += p1; totalP2 += p2;
                }
            });
            if (units.length > 0) topicsData.push({ name: topicName, units: units });
        });

        if (topicsData.length === 0) throw new Error("Nhập ít nhất 1 nội dung!");

        const requestData = {
            license_key: get('license_key'), 
            subject: get('subject'), 
            grade: get('grade'),
            book_series: document.getElementById('book_series').value,
            semester: get('semester'), 
            exam_type: get('exam_type'), 
            time: get('time_limit'),
            use_short_answer: document.getElementById('use_short').checked,
            totalPeriodsHalf1: totalP1, 
            totalPeriodsHalf2: totalP2, 
            topics: topicsData 
        };

        const res = await fetch('/api_matrix', {
            method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify(requestData)
        });
        
        if(!res.ok) {
            let t = await res.text(); try { t = JSON.parse(t).error } catch(e){} throw new Error(`Server: ${t}`);
        }

        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let fullHTML = "";
        while(true) {
            const {done, value} = await reader.read();
            if(done) break;
            fullHTML += decoder.decode(value, {stream:true});
        }
        
        // Clean HTML
        let cleanHTML = fullHTML.replace(/```html/g, '').replace(/```/g, '').trim();
        cleanHTML = cleanHTML.replace(/(\s+)(B\.|C\.|D\.)/g, '<br><b>$2</b>').replace(/(A\.)/g, '<b>$1</b>');

        prev.innerHTML = cleanHTML;
        window.generatedHTML = cleanHTML;
        sec.classList.remove('hidden'); 
        sec.scrollIntoView({behavior:'smooth'});

    } catch(e) { 
        error.innerHTML = e.message; 
        error.classList.remove('hidden'); 
    } finally { 
        loading.classList.add('hidden'); 
        btn.disabled = false; 
    }
}

// --- HÀM SAO CHÉP (COPY) ---
async function handleCopyContent() {
    if (!window.generatedHTML) { alert("Chưa có nội dung!"); return; }
    
    const btn = document.getElementById('btnCopy');
    const oldHtml = btn.innerHTML;

    try {
        const type = "text/html";
        const blob = new Blob([window.generatedHTML], { type });
        const data = [new ClipboardItem({ [type]: blob })];
        await navigator.clipboard.write(data);
        
        btn.classList.add('copied');
        btn.innerHTML = `<i class="fas fa-check"></i> Đã chép!`;
        setTimeout(() => {
            btn.classList.remove('copied');
            btn.innerHTML = oldHtml;
        }, 2000);
    } catch (e) {
        alert("Lỗi sao chép tự động. Hãy bôi đen và nhấn Ctrl+C.");
    }
}

// --- LOGIC XUẤT WORD (DOCX - PHIÊN BẢN SỬA LỖI FLAT STRUCTURE) ---
async function handleDownloadWord() {
    if(!window.generatedHTML) { alert("Chưa có nội dung!"); return; }
    if (typeof docx === 'undefined') { alert("Thư viện Word chưa tải xong. Vui lòng F5!"); return; }

    const btn = document.getElementById('btnDownloadWord');
    const oldText = btn.innerText;
    btn.innerText = "Đang xử lý..."; btn.disabled = true;

    try {
        const { Document, Packer, Paragraph, Table, TableCell, TableRow, WidthType, TextRun, HeadingLevel, AlignmentType, BorderStyle } = window.docx;

        // 1. Hàm tạo đoạn văn (Paragraph) từ node HTML
        function createParagraphFromNode(node, style = {}) {
            const runs = [];
            
            function traverse(n, s) {
                if (n.nodeType === 3) { // Text
                    if(n.nodeValue.trim()) runs.push(new TextRun({ text: n.nodeValue, bold: s.bold, italics: s.italic }));
                } else if (n.nodeType === 1) {
                    const tag = n.tagName.toLowerCase();
                    if (tag === 'br') runs.push(new TextRun({ text: "\n", break: 1 }));
                    else {
                        const newStyle = { ...s, bold: s.bold || tag==='b'||tag==='strong', italic: s.italic || tag==='i'||tag==='em' };
                        Array.from(n.childNodes).forEach(child => traverse(child, newStyle));
                    }
                }
            }
            traverse(node, style);
            return new Paragraph({ children: runs, spacing: { after: 100 } });
        }

        // 2. Hàm tạo bảng (Table) từ node Table HTML
        function createTableFromNode(tableNode) {
            const rows = Array.from(tableNode.querySelectorAll('tr')).map(tr => {
                const cells = Array.from(tr.querySelectorAll('td, th')).map(td => {
                    const cellText = td.innerText.trim();
                    const isBold = td.tagName.toLowerCase() === 'th' || td.querySelector('b, strong');
                    
                    return new TableCell({
                        children: [new Paragraph({
                            children: [new TextRun({ text: cellText, bold: !!isBold })]
                        })],
                        columnSpan: parseInt(td.getAttribute('colspan') || 1),
                        rowSpan: parseInt(td.getAttribute('rowspan') || 1),
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

        // 3. QUÉT VÀ LÀM PHẲNG CẤU TRÚC (TRÁNH LỖI LỒNG GHÉP)
        const parser = new DOMParser();
        const docHTML = parser.parseFromString(`<div>${window.generatedHTML}</div>`, 'text/html');
        const root = docHTML.body.firstElementChild;
        const children = [];

        // Tiêu đề
        children.push(new Paragraph({
            text: "ĐỀ KIỂM TRA & MA TRẬN",
            heading: HeadingLevel.HEADING_1,
            alignment: AlignmentType.CENTER,
            spacing: { after: 300 },
            run: { font: "Times New Roman", size: 28, bold: true }
        }));

        // Duyệt từng phần tử cấp 1 để chuyển đổi
        function processBlock(node) {
            if (node.nodeType === 1) {
                const tag = node.tagName.toLowerCase();
                if (tag === 'table') {
                    children.push(createTableFromNode(node));
                    children.push(new Paragraph("")); // Khoảng cách
                } else if (['p', 'div', 'h1', 'h2', 'h3', 'li'].includes(tag)) {
                    // Nếu là thẻ khối, tạo Paragraph mới
                    const headingMap = {'h1': HeadingLevel.HEADING_1, 'h2': HeadingLevel.HEADING_2, 'h3': HeadingLevel.HEADING_3};
                    const para = createParagraphFromNode(node);
                    if (headingMap[tag]) para.heading = headingMap[tag];
                    children.push(para);
                } else {
                    // Các thẻ khác, duyệt con tiếp
                    Array.from(node.childNodes).forEach(processBlock);
                }
            } else if (node.nodeType === 3 && node.nodeValue.trim()) {
                // Text trôi nổi
                children.push(new Paragraph(node.nodeValue));
            }
        }

        Array.from(root.childNodes).forEach(processBlock);

        // 4. TẠO FILE
        const doc = new Document({ sections: [{ children: children }] });
        const blob = await Packer.toBlob(doc);
        saveAs(blob, `De_Kiem_Tra_${Date.now()}.docx`);

    } catch(e) { 
        alert("Lỗi xuất file: " + e.message); console.error(e); 
    } finally { 
        btn.innerText = oldText; btn.disabled = false; 
    }
}
