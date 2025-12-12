// File: public/js/app.js
// --- KHAI BÁO BIẾN TOÀN CỤC ---
window.generatedHTML = "";

document.addEventListener('DOMContentLoaded', () => {
    // 1. Khởi tạo
    addTopic();

    // 2. Gán sự kiện
    const bindBtn = (id, handler) => {
        const el = document.getElementById(id);
        if (el) el.addEventListener('click', handler);
    };

    bindBtn('btnAddTopic', addTopic);
    bindBtn('btnGenerate', handleGenerate);
    bindBtn('btnDownloadWord', handleDownloadWord);
    bindBtn('btnCopy', handleCopyContent);

    // 3. Logic ẩn hiện ô nhập tiết
    const examTypeSelect = document.getElementById('exam_type');
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

// --- HÀM SAO CHÉP ---
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
        setTimeout(() => { btn.classList.remove('copied'); btn.innerHTML = oldHtml; }, 2000);
    } catch (e) {
        alert("Lỗi sao chép tự động. Hãy bôi đen và nhấn Ctrl+C.");
    }
}

// ============================================================
// --- LOGIC XUẤT WORD (DOCX) - PHIÊN BẢN AN TOÀN NHẤT ---
// ============================================================
async function handleDownloadWord() {
    if(!window.generatedHTML) { alert("Chưa có nội dung!"); return; }
    if (typeof docx === 'undefined') { alert("Thư viện Word chưa tải xong. Vui lòng F5!"); return; }

    const btn = document.getElementById('btnDownloadWord');
    const oldText = btn.innerText;
    btn.innerText = "Đang xử lý..."; btn.disabled = true;

    try {
        // Import các thành phần từ thư viện docx (Phiên bản 7.1.0)
        const { Document, Packer, Paragraph, Table, TableCell, TableRow, WidthType, TextRun, HeadingLevel, AlignmentType, BorderStyle } = window.docx;

        // 1. Hàm tạo Paragraph từ Text (Xử lý đậm, nghiêng)
        function createPara(text, options = {}) {
            // Tách các thẻ HTML cơ bản
            const runs = [];
            // Giả lập DOM để parse text
            const tempDiv = document.createElement('div');
            tempDiv.innerHTML = text.replace(/\n/g, '<br>'); // Giữ xuống dòng

            function traverse(node, style) {
                if (node.nodeType === 3) { // Text Node
                    if(node.nodeValue) runs.push(new TextRun({ text: node.nodeValue, ...style }));
                } else if (node.nodeType === 1) { // Element Node
                    const tag = node.tagName.toLowerCase();
                    if(tag === 'br') runs.push(new TextRun({ text: "\n", break: 1 }));
                    else {
                        const newStyle = { ...style, bold: style.bold || tag==='b'||tag==='strong', italics: style.italics || tag==='i'||tag==='em' };
                        Array.from(node.childNodes).forEach(c => traverse(c, newStyle));
                    }
                }
            }
            traverse(tempDiv, { bold: options.bold, italics: options.italics });
            
            return new Paragraph({
                children: runs,
                alignment: options.alignment || AlignmentType.LEFT,
                heading: options.heading,
                spacing: { after: 100 }
            });
        }

        // 2. Hàm tạo Table Docx
        function createTable(tableNode) {
            const docxRows = [];
            const trs = tableNode.querySelectorAll('tr');
            
            trs.forEach(tr => {
                const docxCells = [];
                tr.querySelectorAll('td, th').forEach(cell => {
                    const cellText = cell.innerText.trim();
                    const isHeader = cell.tagName.toLowerCase() === 'th';
                    const colspan = parseInt(cell.getAttribute('colspan') || 1);
                    const rowspan = parseInt(cell.getAttribute('rowspan') || 1);

                    docxCells.push(new TableCell({
                        children: [
                            new Paragraph({
                                children: [new TextRun({ text: cellText, bold: isHeader })],
                                alignment: isHeader ? AlignmentType.CENTER : AlignmentType.LEFT
                            })
                        ],
                        columnSpan: colspan,
                        rowSpan: rowspan,
                        width: { size: 100, type: WidthType.PERCENTAGE },
                        borders: {
                            top: { style: BorderStyle.SINGLE, size: 1, color: "000000" },
                            bottom: { style: BorderStyle.SINGLE, size: 1, color: "000000" },
                            left: { style: BorderStyle.SINGLE, size: 1, color: "000000" },
                            right: { style: BorderStyle.SINGLE, size: 1, color: "000000" },
                        }
                    }));
                });
                docxRows.push(new TableRow({ children: docxCells }));
            });

            return new Table({
                rows: docxRows,
                width: { size: 100, type: WidthType.PERCENTAGE }
            });
        }

        // 3. QUÉT VÀ CHUYỂN ĐỔI (LOGIC PHẲNG)
        const docChildren = [];
        const parser = new DOMParser();
        const docDOM = parser.parseFromString(`<div>${window.generatedHTML}</div>`, 'text/html');
        const root = docDOM.body.firstElementChild;

        // Thêm Tiêu đề
        docChildren.push(new Paragraph({
            text: "ĐỀ KIỂM TRA & MA TRẬN",
            heading: HeadingLevel.HEADING_1,
            alignment: AlignmentType.CENTER,
            spacing: { after: 300 }
        }));

        // Duyệt qua các node con trực tiếp của root
        Array.from(root.childNodes).forEach(node => {
            if (node.nodeType === 1) { // Element
                const tag = node.tagName.toLowerCase();
                
                if (tag === 'table') {
                    docChildren.push(createTable(node));
                    docChildren.push(new Paragraph("")); // Khoảng cách sau bảng
                } 
                else if (tag.match(/^h[1-6]$/)) {
                    docChildren.push(createPara(node.innerHTML, { heading: HeadingLevel.HEADING_2, bold: true }));
                }
                else if (tag === 'p' || tag === 'div' || tag === 'li') {
                    // Xử lý nội dung văn bản thường
                    docChildren.push(createPara(node.innerHTML));
                }
                else {
                    // Các thẻ khác gom về text
                    docChildren.push(createPara(node.innerText));
                }
            }
        });

        // 4. ĐÓNG GÓI FILE
        const doc = new Document({
            sections: [{
                properties: {},
                children: docChildren
            }]
        });

        const blob = await Packer.toBlob(doc);
        saveAs(blob, `De_Kiem_Tra_${Date.now()}.docx`);

    } catch(e) { 
        alert("Lỗi tạo file: " + e.message); 
        console.error(e); 
    } finally { 
        btn.innerText = oldText; 
        btn.disabled = false; 
    }
}
