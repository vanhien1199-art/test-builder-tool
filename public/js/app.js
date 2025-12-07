// File: public/js/app.js

// --- KHAI BÁO BIẾN TOÀN CỤC ---
window.generatedHTML = "";

document.addEventListener('DOMContentLoaded', () => {
    // 1. Khởi tạo
    addTopic();

    // 2. Gán sự kiện cho các nút (ĐÃ SỬA LỖI GÁN NHẦM)
    const btnAdd = document.getElementById('btnAddTopic');
    const btnGen = document.getElementById('btnGenerate');
    const btnDown = document.getElementById('btnDownloadWord');
    const examTypeSelect = document.getElementById('exam_type');

    if (btnAdd) btnAdd.addEventListener('click', addTopic);
    if (btnGen) btnGen.addEventListener('click', handleGenerate); // Đã sửa lại đúng
    if (btnDown) btnDown.addEventListener('click', handleDownloadWord);

    // 3. Logic ẩn hiện ô nhập tiết (Học kì)
    if (examTypeSelect) {
        examTypeSelect.addEventListener('change', updatePeriodInputs);
        setTimeout(updatePeriodInputs, 100); 
    }

    // 4. Sự kiện ủy quyền (Event Delegation)
    document.getElementById('topics-container').addEventListener('click', function(e) {
        const target = e.target;
        
        // Xóa Chủ đề lớn
        if (target.closest('.remove-topic-btn')) {
            if(confirm("Bạn có chắc muốn xóa toàn bộ Chương này?")) {
                target.closest('.topic-wrapper').remove();
            }
            return;
        }
        
        // Thêm Đơn vị con
        if (target.closest('.btn-add-unit')) {
            const topicWrapper = target.closest('.topic-wrapper');
            addUnit(topicWrapper.querySelector('.units-container'));
            return;
        }

        // Xóa Đơn vị con
        if (target.closest('.remove-unit-btn')) {
            target.closest('.unit-item').remove();
            return;
        }
    });
});

// --- HÀM ẨN HIỆN Ô NHẬP TIẾT ---
function updatePeriodInputs() {
    const type = document.getElementById('exam_type').value; 
    
    document.querySelectorAll('.unit-item').forEach(item => {
        const div1 = item.querySelector('.hk-input-1');
        const input1 = item.querySelector('.unit-p1');
        const div2 = item.querySelector('.hk-input-2');

        if (type === 'hk') {
            div1.classList.remove('hidden');
            input1.placeholder = "Tiết (Đầu)";
            div2.classList.remove('hidden');
        } else {
            div1.classList.remove('hidden');
            input1.placeholder = "Tổng tiết";
            div2.classList.add('hidden');
        }
    });
}

// --- HÀM THÊM CHỦ ĐỀ (CHA) ---
function addTopic() {
    const container = document.getElementById('topics-container');
    const template = document.getElementById('topic-template');
    if (!container || !template) return;

    const clone = template.content.cloneNode(true);
    const unitsContainer = clone.querySelector('.units-container');
    container.appendChild(clone);
    addUnit(unitsContainer);
}

// --- HÀM THÊM ĐƠN VỊ (CON) ---
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

    loading.classList.remove('hidden'); error.innerText = ""; sec.classList.add('hidden'); prev.innerHTML = ""; btn.disabled = true;

    try {
        const get = id => document.getElementById(id).value.trim();
        if (!get('license_key')) throw new Error("Vui lòng nhập Mã Kích Hoạt!");

        const topicsData = [];
        let totalP1 = 0;
        let totalP2 = 0;

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
                    totalP1 += p1;
                    totalP2 += p2;
                }
            });

            if (units.length > 0) {
                topicsData.push({ name: topicName, units: units });
            }
        });

        if (topicsData.length === 0) throw new Error("Vui lòng nhập ít nhất 1 chủ đề!");

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
            method: 'POST', 
            headers: {'Content-Type':'application/json'}, 
            body: JSON.stringify(requestData)
        });
        
        if(!res.ok) {
            let t = await res.text();
            try { t = JSON.parse(t).error } catch(e){}
            throw new Error(`Lỗi Server: ${t}`);
        }

        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let fullHTML = "";
        while(true) {
            const {done, value} = await reader.read();
            if(done) break;
            fullHTML += decoder.decode(value, {stream:true});
        }
            
        // 6. XỬ LÝ & LÀM SẠCH HTML (NÂNG CẤP)
        let cleanHTML = fullHTML
            .replace(/```html/g, '') // Xóa markdown mở
            .replace(/```/g, '')     // Xóa markdown đóng
            .trim();

        // FIX LỖI: Tự động thêm <br> trước các đáp án B., C., D. nếu AI viết dính liền
        // Tìm các mẫu " B.", " C.", " D." (có khoảng trắng phía trước) và thay bằng "<br><b>B.</b>"
        cleanHTML = cleanHTML.replace(/(\s+)(B\.|C\.|D\.)/g, '<br><b>$2</b>');
        
        // In đậm luôn đáp án A.
        cleanHTML = cleanHTML.replace(/(A\.)/g, '<b>$1</b>');

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

// ============================================================
// --- LOGIC XUẤT WORD (ĐÃ SỬA LỖI XUỐNG DÒNG) ---
// ============================================================
async function handleDownloadWord() {
    if(!window.generatedHTML) { alert("Chưa có nội dung!"); return; }
    if (typeof docx === 'undefined') { alert("Thư viện lỗi. F5 lại trang!"); return; }

    const btn = document.getElementById('btnDownloadWord');
    const oldText = btn.innerText;
    btn.innerText = "Đang tạo file..."; btn.disabled = true;

    try {
        const { Document, Packer, Paragraph, Table, TableCell, TableRow, WidthType, TextRun, Math: MathObj, MathRun, MathFraction, MathSuperScript, MathSubScript, MathRadical, BorderStyle, HeadingLevel, AlignmentType } = window.docx;

        // 1. Convert MathML -> Docx
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

        // 2. Parse Content (ĐÃ SỬA: Xử lý <br> thành xuống dòng)
        function parseContent(htmlText) {
            // Tách theo LaTeX
            const parts = htmlText.split(/\$\$(.*?)\$\$/g);
            const runs = [];

            parts.forEach((part, index) => {
                if (index % 2 === 1) { // LaTeX
                    try {
                        if (typeof temml !== 'undefined') {
                            const xmlString = temml.renderToString(part, { xml: true });
                            const parser = new DOMParser();
                            const xmlDoc = parser.parseFromString(xmlString, "text/xml");
                            const mathRoot = xmlDoc.getElementsByTagName("math")[0];
                            runs.push(new MathObj({ children: convertXmlNode(mathRoot) }));
                        } else { runs.push(new TextRun({ text: part, bold: true, color: "2E75B6" })); }
                    } catch (e) { runs.push(new TextRun({ text: `(Lỗi: ${part})`, color: "FF0000" })); }
                } else { // Text thường
                    // QUAN TRỌNG: Thay <br> thành \n TRƯỚC KHI xóa tag
                    let cleanText = part.replace(/<br\s*\/?>/gi, "\n").replace(/<\/p>/gi, "\n").replace(/<\/div>/gi, "\n");
                    // Xóa các thẻ HTML còn lại
                    cleanText = cleanText.replace(/<[^>]+>/g, ""); 
                    // Decode ký tự đặc biệt
                    cleanText = cleanText.replace(/&nbsp;/g, " ").replace(/&lt;/g, "<").replace(/&gt;/g, ">");

                    // Tách theo dòng (\n) để tạo break
                    const lines = cleanText.split('\n');
                    lines.forEach((line, i) => {
                        if (line) runs.push(new TextRun(line));
                        // Nếu không phải dòng cuối thì thêm ngắt dòng
                        if (i < lines.length - 1) {
                            runs.push(new TextRun({ break: 1 }));
                        }
                    });
                }
            });
            return [new Paragraph({ children: runs })];
        }

        // 3. Build Document
        const parser = new DOMParser();
        const docHTML = parser.parseFromString(window.generatedHTML, 'text/html');
        const docChildren = [new Paragraph({ text: "ĐỀ KIỂM TRA", heading: HeadingLevel.HEADING_1, alignment: AlignmentType.CENTER, spacing: { after: 300 } })];

        Array.from(docHTML.body.children).forEach(el => {
            const tagName = el.tagName;
            
            if (tagName.match(/^H[1-6]$/)) {
                // Xử lý tiêu đề (H1, H2...)
                docChildren.push(new Paragraph({
                    children: parseContent(el.innerHTML)[0].root.children,
                    heading: HeadingLevel.HEADING_2, spacing: { before: 200, after: 100 }
                }));
            } else if (tagName === 'TABLE') {
                // Xử lý Bảng
                const rows = Array.from(el.querySelectorAll('tr')).map(tr => 
                    new TableRow({ children: Array.from(tr.querySelectorAll('td, th')).map(td => {
                        const colSpanAttr = td.getAttribute('colspan');
                        const rowSpanAttr = td.getAttribute('rowspan');
                        return new TableCell({ 
                            children: parseContent(td.innerHTML), // Nội dung ô (có xuống dòng)
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
                // Xử lý đoạn văn thường (Câu hỏi, Đáp án...)
                docChildren.push(...parseContent(el.innerHTML));
            }
        });

        const doc = new Document({ sections: [{ children: docChildren }] });
        const blob = await Packer.toBlob(doc);
        saveAs(blob, `De_Thi_Final_${Date.now()}.docx`);

    } catch(e) { alert("Lỗi xuất file: " + e.message); console.error(e); } 
    finally { btn.innerText = oldText; btn.disabled = false; }
}
