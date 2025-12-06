// File: public/js/app.js

window.generatedHTML = "";

document.addEventListener('DOMContentLoaded', () => {
    // 1. Thêm chủ đề đầu tiên mặc định
    addTopic();

    // 2. Gán sự kiện
    const on = (id, e, f) => { const el = document.getElementById(id); if(el) el.addEventListener(e, f); }
    
    on('btnAddTopic', 'click', addTopic);
    on('btnGenerate', 'click', handleGenerate);
    on('btnDownloadWord', 'click', handleDownloadWord);

    // 3. Logic ẩn hiện ô nhập tiết (Học kì)
    const examType = document.getElementById('exam_type');
    if (examType) {
        examType.addEventListener('change', updatePeriodInputs);
        setTimeout(updatePeriodInputs, 100); // Init
    }

    // 4. Sự kiện ủy quyền (Event Delegation) cho toàn bộ nút động
    document.getElementById('topics-container').addEventListener('click', function(e) {
        const target = e.target;
        
        // Xóa Chủ đề lớn
        if (target.closest('.remove-topic-btn')) {
            if(confirm("Bạn có chắc muốn xóa toàn bộ chủ đề này?")) {
                target.closest('.topic-wrapper').remove();
            }
        }
        
        // Thêm Đơn vị kiến thức con
        if (target.closest('.btn-add-unit')) {
            const topicWrapper = target.closest('.topic-wrapper');
            addUnit(topicWrapper.querySelector('.units-container'));
        }

        // Xóa Đơn vị kiến thức con
        if (target.closest('.remove-unit-btn')) {
            target.closest('.unit-item').remove();
        }
    });
});

// --- HÀM ẨN HIỆN Ô NHẬP TIẾT ---
function updatePeriodInputs() {
    const isHK = document.getElementById('exam_type').value === 'hk';
    
    // Tìm tất cả ô nhập tiết 1 và tiết 2
    document.querySelectorAll('.hk-input-1, .hk-input-2').forEach(div => {
        if (isHK) div.classList.remove('hidden');
        else div.classList.add('hidden');
    });
}

// --- HÀM THÊM CHỦ ĐỀ (CHA) ---
function addTopic() {
    const container = document.getElementById('topics-container');
    const template = document.getElementById('topic-template');
    const clone = template.content.cloneNode(true);
    
    // Thêm sẵn 1 dòng con mặc định cho chủ đề mới
    const unitsContainer = clone.querySelector('.units-container');
    
    container.appendChild(clone);
    
    // Thêm ngay 1 bài học con vào chủ đề vừa tạo
    addUnit(unitsContainer);
}

// --- HÀM THÊM ĐƠN VỊ KIẾN THỨC (CON) ---
function addUnit(container) {
    const template = document.getElementById('unit-template');
    const clone = template.content.cloneNode(true);
    container.appendChild(clone);
    
    // Cập nhật lại trạng thái ẩn hiện số tiết cho dòng mới
    updatePeriodInputs();
}

// --- HÀM XỬ LÝ GỬI DỮ LIỆU ---
async function handleGenerate() {
    const btn = document.getElementById('btnGenerate');
    const loading = document.getElementById('loadingMsg');
    const error = document.getElementById('errorMsg');
    const sec = document.getElementById('previewSection');
    const prev = document.getElementById('previewContent');

    loading.classList.remove('hidden'); error.innerText = ""; sec.classList.add('hidden'); prev.innerHTML = ""; btn.disabled = true;

    try {
        const get = id => document.getElementById(id).value.trim();
        
        // 1. Kiểm tra License
        if (!get('license_key')) throw new Error("Vui lòng nhập Mã Kích Hoạt!");

        // 2. Thu thập dữ liệu LỒNG NHAU
        const topicsData = [];
        let totalP1 = 0;
        let totalP2 = 0;

        // Duyệt từng Chủ đề lớn
        document.querySelectorAll('.topic-wrapper').forEach(topicEl => {
            const topicName = topicEl.querySelector('.topic-name').value.trim();
            if (!topicName) return; // Bỏ qua nếu tên chủ đề rỗng

            const units = [];
            // Duyệt từng Đơn vị con trong chủ đề đó
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
                topicsData.push({
                    name: topicName,
                    units: units // Mảng con
                });
            }
        });

        if (topicsData.length === 0) throw new Error("Vui lòng nhập ít nhất 1 chủ đề và nội dung!");

        const requestData = {
            license_key: get('license_key'), 
            subject: get('subject'), 
            grade: get('grade'),
            semester: get('semester'), 
            exam_type: get('exam_type'), 
            time: get('time_limit'),
            use_short_answer: document.getElementById('use_short').checked,
            totalPeriodsHalf1: totalP1, // Tổng tự tính
            totalPeriodsHalf2: totalP2,
            topics: topicsData // Cấu trúc mới: Mảng lồng nhau
        };

        // 3. Gọi API
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

        // 4. Stream & Render
        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let fullHTML = "";
        while(true) {
            const {done, value} = await reader.read();
            if(done) break;
            fullHTML += decoder.decode(value, {stream:true});
        }
        
        const cleanHTML = fullHTML.replace(/```html/g, '').replace(/```/g, '').trim();
        prev.innerHTML = cleanHTML;
        window.generatedHTML = cleanHTML;
        
        sec.classList.remove('hidden'); 
        sec.scrollIntoView({behavior:'smooth'});

    } catch(e) { 
        error.innerHTML = e.message; error.classList.remove('hidden'); 
    } finally { 
        loading.classList.add('hidden'); btn.disabled = false; 
    }
}

// --- GIỮ NGUYÊN HÀM XUẤT WORD ---
async function handleDownloadWord() {
    if(!window.generatedHTML) { alert("Chưa có nội dung!"); return; }
    if (typeof docx === 'undefined') { alert("Thư viện lỗi. F5 lại trang!"); return; }

    const btn = document.getElementById('btnDownloadWord');
    btn.innerHTML = "Đang tạo file..."; btn.disabled = true;

    try {
        const { Document, Packer, Paragraph, Table, TableCell, TableRow, WidthType, TextRun, Math: MathObj, MathRun, MathFraction, MathSuperScript, MathSubScript, MathRadical, BorderStyle, HeadingLevel, AlignmentType } = window.docx;

        function convertXmlNode(node) {
            if (!node) return [];
            const results = [];
            node.childNodes.forEach(child => {
                if (child.nodeType === 3) { if (child.nodeValue.trim()) results.push(new MathRun(child.nodeValue)); return; }
                const tag = child.tagName.toLowerCase();
                const children = convertXmlNode(child);
                switch (tag) {
                    case 'mn': case 'mi': case 'mo': case 'mtext': results.push(new MathRun(child.textContent)); break;
                    case 'mfrac': if (children.length >= 2) results.push(new MathFraction({ numerator: [children[0]], denominator: [children[1]] })); break;
                    case 'msup': if (children.length >= 2) results.push(new MathSuperScript({ children: [children[0]], superScript: [children[1]] })); break;
                    case 'msub': if (children.length >= 2) results.push(new MathSubScript({ children: [children[0]], subScript: [children[1]] })); break;
                    case 'msqrt': results.push(new MathRadical({ children: children })); break;
                    case 'mrow': case 'mstyle': results.push(...children); break;
                    default: results.push(...children); break;
                }
            });
            return results;
        }

        function parseContent(htmlText) {
            const parts = htmlText.split(/\$\$(.*?)\$\$/g);
            const runs = [];
            parts.forEach((part, index) => {
                if (index % 2 === 1) { 
                    try {
                        if (typeof temml !== 'undefined') {
                            const xmlString = temml.renderToString(part, { xml: true });
                            const parser = new DOMParser();
                            const xmlDoc = parser.parseFromString(xmlString, "text/xml");
                            const mathRoot = xmlDoc.getElementsByTagName("math")[0];
                            runs.push(new MathObj({ children: convertXmlNode(mathRoot) }));
                        } else { runs.push(new TextRun({ text: part, bold: true, color: "2E75B6" })); }
                    } catch (e) { runs.push(new TextRun({ text: `(Lỗi: ${part})`, color: "FF0000" })); }
                } else {
                    const cleanText = part.replace(/<[^>]*>?/gm, " ").replace(/&nbsp;/g, " ");
                    if (cleanText.trim()) runs.push(new TextRun(cleanText));
                }
            });
            return [new Paragraph({ children: runs })];
        }

        const parser = new DOMParser();
        const docHTML = parser.parseFromString(window.generatedHTML, 'text/html');
        const docChildren = [new Paragraph({ text: "ĐỀ KIỂM TRA", heading: HeadingLevel.HEADING_1, alignment: AlignmentType.CENTER, spacing: { after: 300 } })];

        Array.from(docHTML.body.children).forEach(el => {
            const tagName = el.tagName;
            if (tagName.match(/^H[1-6]$/)) {
                docChildren.push(new Paragraph({
                    children: parseContent(el.innerHTML)[0].root.children,
                    heading: HeadingLevel.HEADING_2, spacing: { before: 200, after: 100 }
                }));
            } else if (tagName === 'TABLE') {
                const rows = Array.from(el.querySelectorAll('tr')).map(tr => 
                    new TableRow({ children: Array.from(tr.querySelectorAll('td, th')).map(td => {
                        const colSpanAttr = td.getAttribute('colspan');
                        const rowSpanAttr = td.getAttribute('rowspan');
                        return new TableCell({ 
                            children: parseContent(td.innerHTML),
                            columnSpan: colSpanAttr ? parseInt(colSpanAttr) : undefined,
                            rowSpan: rowSpanAttr ? parseInt(rowSpanAttr) : undefined,
                            width: { size: 100, type: WidthType.PERCENTAGE }, 
                            borders: {top:{style:BorderStyle.SINGLE, size:1}, bottom:{style:BorderStyle.SINGLE, size:1}, left:{style:BorderStyle.SINGLE, size:1}, right:{style:BorderStyle.SINGLE, size:1}} 
                        }); 
                    })})
                );
                docChildren.push(new Table({ rows: rows, width: { size: 100, type: WidthType.PERCENTAGE } }));
                docChildren.push(new Paragraph(""));
            } else if (el.innerText.trim()) {
                docChildren.push(...parseContent(el.innerHTML));
            }
        });

        const doc = new Document({ sections: [{ children: docChildren }] });
        const blob = await Packer.toBlob(doc);
        saveAs(blob, `De_Thi_Full_${Date.now()}.docx`);

    } catch(e) { alert("Lỗi: " + e.message); } finally { btn.innerText = "TẢI VỀ WORD"; btn.disabled = false; }
}
