// File: public/js/app.js

// --- KHAI BÁO BIẾN TOÀN CỤC ---
window.generatedHTML = "";

document.addEventListener('DOMContentLoaded', () => {
    // 1. Khởi tạo
    addTopicRow();

    // 2. Gán sự kiện cho các nút
    const btnAdd = document.getElementById('btnAddTopic');
    const btnGen = document.getElementById('btnGenerate');
    const btnDown = document.getElementById('btnDownloadWord');
    const examTypeSelect = document.getElementById('exam_type');

    if (btnAdd) btnAdd.addEventListener('click', addTopicRow);
    if (btnGen) btnGen.addEventListener('click', handleGenerate);
    if (btnDown) btnDown.addEventListener('click', handleDownloadWord);

    // 3. Xử lý logic Ẩn/Hiện Học kì
    if (examTypeSelect) {
        examTypeSelect.addEventListener('change', function() {
            const isHK = this.value === 'hk';
            const hkConfig = document.getElementById('hk-config');
            const topicPeriodInputs = document.querySelectorAll('.hk-period-inputs');

            if (hkConfig) {
                if (isHK) hkConfig.classList.remove('hidden');
                else hkConfig.classList.add('hidden');
            }

            topicPeriodInputs.forEach(el => {
                if (isHK) el.classList.remove('hidden');
                else el.classList.add('hidden');
            });
        });
        // Kích hoạt ngay lần đầu
        examTypeSelect.dispatchEvent(new Event('change'));
    }

    // 4. Sự kiện ủy quyền cho nút xóa dòng
    document.getElementById('topics-container').addEventListener('click', function(e) {
        if (e.target.closest('.remove-topic-btn')) {
            e.target.closest('.topic-item').remove();
        }
    });
});

// --- HÀM THÊM DÒNG CHỦ ĐỀ ---
function addTopicRow() {
    const container = document.getElementById('topics-container');
    const template = document.getElementById('topic-template');
    if (container && template) {
        const clone = template.content.cloneNode(true);
        container.appendChild(clone);

        // Kiểm tra lại trạng thái hiển thị của dòng mới thêm
        const examType = document.getElementById('exam_type');
        if (examType && examType.value === 'hk') {
            const newRow = container.lastElementChild;
            const hkInputs = newRow.querySelector('.hk-period-inputs');
            if (hkInputs) hkInputs.classList.remove('hidden');
        }
    }
}

// --- HÀM TẠO DỮ LIỆU TỪ AI ---
async function handleGenerate() {
    const btn = document.getElementById('btnGenerate');
    const loading = document.getElementById('loadingMsg');
    const error = document.getElementById('errorMsg');
    const sec = document.getElementById('previewSection');
    const prev = document.getElementById('previewContent');

    // Reset UI
    loading.classList.remove('hidden'); 
    error.classList.add('hidden'); 
    error.innerHTML = "";
    sec.classList.add('hidden'); 
    prev.innerHTML = ""; 
    btn.disabled = true;

    try {
        const get = id => document.getElementById(id).value.trim();
        const data = {
            license_key: get('license_key'), 
            subject: get('subject'), 
            grade: get('grade'),
            semester: document.getElementById('semester').value, 
            exam_type: document.getElementById('exam_type').value, 
            time: document.getElementById('time_limit').value,
            use_short_answer: document.getElementById('use_short').checked,
            totalPeriodsHalf1: parseInt(document.getElementById('total_half1').value) || 0, 
            totalPeriodsHalf2: parseInt(document.getElementById('total_half2').value) || 0,
            topics: []
        };
        
        // Thu thập topic
        document.querySelectorAll('.topic-item').forEach(r => {
            const n = r.querySelector('.topic-name').value.trim();
            const c = r.querySelector('.topic-content').value.trim();
            const p1 = parseInt(r.querySelector('.topic-period-1').value) || 0;
            const p2 = parseInt(r.querySelector('.topic-period-2').value) || 0;
            if(n) data.topics.push({name:n, content:c, p1: p1, p2: p2});
        });

        if(data.topics.length === 0) throw new Error("Vui lòng nhập ít nhất 1 chủ đề!");

        // Gọi API
        const res = await fetch('/api_matrix', {
            method: 'POST', 
            headers: {'Content-Type':'application/json'}, 
            body: JSON.stringify(data)
        });
        
        if(!res.ok) {
            let errMsg = await res.text();
            try { errMsg = JSON.parse(errMsg).error } catch(e){}
            throw new Error(`Lỗi Server: ${errMsg}`);
        }

        // Đọc Stream
        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let fullHTML = "";
        while(true) {
            const {done, value} = await reader.read();
            if(done) break;
            fullHTML += decoder.decode(value, {stream:true});
        }
        
        // Render lên màn hình (Loại bỏ markdown block)
        const cleanHTML = fullHTML.replace(/```html/g, '').replace(/```/g, '').trim();
        prev.innerHTML = cleanHTML;
        window.generatedHTML = cleanHTML;
        
        sec.classList.remove('hidden'); 
        sec.scrollIntoView({behavior:'smooth'});

    } catch(e) { 
        error.innerHTML = `<i class="fas fa-exclamation-triangle"></i> ${e.message}`; 
        error.classList.remove('hidden');
    } finally { 
        loading.classList.add('hidden'); 
        btn.disabled = false; 
    }
}

// ============================================================
// --- LOGIC XUẤT FILE DOCX (NATIVE EQUATION 100%) ---
// ============================================================
async function handleDownloadWord() {
    if(!window.generatedHTML) { alert("Chưa có nội dung!"); return; }
    
    // Kiểm tra thư viện
    if (typeof docx === 'undefined') {
        alert("Lỗi: Thư viện DOCX chưa tải xong hoặc bị chặn mạng. Vui lòng F5."); return;
    }

    const btn = document.getElementById('btnDownloadWord');
    const originalText = btn.innerHTML;
    btn.innerHTML = `<i class="fas fa-spinner fa-spin"></i> Đang tạo file...`; 
    btn.disabled = true;

    try {
        const { Document, Packer, Paragraph, Table, TableCell, TableRow, WidthType, TextRun, Math: MathObj, MathRun, MathFraction, MathSuperScript, MathSubScript, MathRadical, BorderStyle, HeadingLevel, AlignmentType } = window.docx;

        // 1. Hàm đệ quy: XML Node -> Docx Math Object
        function convertXmlNode(node) {
            if (!node) return [];
            const results = [];
            node.childNodes.forEach(child => {
                if (child.nodeType === 3) { // Text Node
                    if (child.nodeValue.trim()) results.push(new MathRun(child.nodeValue));
                    return;
                }
                const tag = child.tagName.toLowerCase();
                const children = convertXmlNode(child);
                
                switch (tag) {
                    case 'mn': case 'mi': case 'mo': case 'mtext': 
                        results.push(new MathRun(child.textContent)); break;
                    case 'mfrac':
                        if (children.length >= 2) results.push(new MathFraction({ numerator: [children[0]], denominator: [children[1]] })); break;
                    case 'msup':
                        if (children.length >= 2) results.push(new MathSuperScript({ children: [children[0]], superScript: [children[1]] })); break;
                    case 'msub':
                        if (children.length >= 2) results.push(new MathSubScript({ children: [children[0]], subScript: [children[1]] })); break;
                    case 'msqrt':
                        results.push(new MathRadical({ children: children })); break;
                    case 'mrow': case 'mstyle': 
                        results.push(...children); break;
                    default: 
                        results.push(...children); break;
                }
            });
            return results;
        }

        // 2. Parse nội dung (Text + LaTeX)
        function parseContent(htmlText) {
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
                            const mathChildren = convertXmlNode(mathRoot);
                            runs.push(new MathObj({ children: mathChildren }));
                        } else {
                            // Fallback màu xanh chuẩn HEX
                            runs.push(new TextRun({ text: part, bold: true, color: "2E75B6" }));
                        }
                    } catch (e) { 
                        // Lỗi màu đỏ chuẩn HEX
                        runs.push(new TextRun({ text: `$$${part}$$`, color: "FF0000" })); 
                    }
                } else { // Text
                    const cleanText = part.replace(/<[^>]*>?/gm, " ").replace(/&nbsp;/g, " ");
                    if (cleanText.trim()) runs.push(new TextRun(cleanText));
                }
            });
            return [new Paragraph({ children: runs })];
        }

        // 3. Xây dựng Document
        const parser = new DOMParser();
        const docHTML = parser.parseFromString(window.generatedHTML, 'text/html');
        const docChildren = [
            new Paragraph({ text: "ĐỀ KIỂM TRA", heading: HeadingLevel.HEADING_1, alignment: AlignmentType.CENTER, spacing: { after: 300 } })
        ];

        const docBodyChildren = Array.from(docHTML.body.children);
        
        docBodyChildren.forEach(el => {
            const tagName = el.tagName;
            const innerHTML = el.innerHTML;
            
            // Xử lý Tiêu đề
            if (tagName.match(/^H[1-6]$/)) {
                let level = HeadingLevel.HEADING_2; // Mặc định
                if(tagName === 'H1') level = HeadingLevel.HEADING_1;
                // ... map thêm nếu cần
                
                docChildren.push(new Paragraph({
                    children: parseContent(innerHTML)[0].root.children, 
                    heading: level,
                    spacing: { before: 200, after: 100 }
                }));
            } 
            // Xử lý Bảng
            else if (tagName === 'TABLE') {
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
            }
            // Xử lý Đoạn văn
            else if (el.innerText.trim()) {
                docChildren.push(...parseContent(innerHTML));
            }
        });

        const doc = new Document({ sections: [{ children: docChildren }] });
        const blob = await Packer.toBlob(doc);
        saveAs(blob, `De_Thi_AI_Pro_${Date.now()}.docx`);

    } catch(e) {
        alert("Lỗi xuất file: " + e.message);
        console.error(e);
    } finally {
        btn.innerHTML = originalText;
        btn.disabled = false;
    }
}
