// File: public/js/app.js - Logic xử lý chính cho ExamMatrix AI

// --- KHAI BÁO BIẾN TOÀN CỤC ---
window.generatedHTML = "";

document.addEventListener('DOMContentLoaded', () => {
    // 1. Khởi tạo dòng chủ đề đầu tiên
    addTopicRow();

    // 2. Gán sự kiện cho các nút
    const btnAdd = document.getElementById('btnAddTopic');
    const btnGen = document.getElementById('btnGenerate');
    const btnDown = document.getElementById('btnDownloadWord');
    const examTypeSelect = document.getElementById('exam_type');

    if (btnAdd) btnAdd.addEventListener('click', addTopicRow);
    if (btnGen) btnDown.addEventListener('click', handleDownloadWord); // Note: Chỉ gán download handler cho nút download
    if (btnDown) btnDown.addEventListener('click', handleDownloadWord);
    
    // Sửa lỗi gán sự kiện cho nút Generate: Cần gọi handleGenerate
    if (btnGen) btnGen.addEventListener('click', handleGenerate);

    // 3. Xử lý Logic ẩn hiện ô nhập số tiết (Học kì)
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
        examTypeSelect.dispatchEvent(new Event('change'));
    }
    
    // Gán sự kiện xóa cho các dòng chủ đề đã có (hoặc sẽ có)
    document.getElementById('topics-container').addEventListener('click', function(e) {
        if (e.target.closest('.remove-topic-btn')) {
            e.target.closest('.topic-item').remove();
        }
    });
});

// --- HÀM THÊM CHỦ ĐỀ ---
function addTopicRow() {
    const container = document.getElementById('topics-container');
    const template = document.getElementById('topic-template');
    if (container && template) {
        const clone = template.content.cloneNode(true);
        container.appendChild(clone);

        const examType = document.getElementById('exam_type');
        if (examType && examType.value === 'hk') {
            const newRow = container.lastElementChild;
            const hkInputs = newRow.querySelector('.hk-period-inputs');
            if (hkInputs) hkInputs.classList.remove('hidden');
        }
    }
}

// --- HÀM TẠO DỮ LIỆU: BỎ LỌC BẢNG ---
async function handleGenerate() {
    const btn = document.getElementById('btnGenerate');
    const loading = document.getElementById('loadingMsg');
    const error = document.getElementById('errorMsg');
    const sec = document.getElementById('previewSection');
    const prev = document.getElementById('previewContent');

    loading.classList.remove('hidden'); error.innerText = ""; sec.classList.add('hidden'); prev.innerHTML = ""; btn.disabled = true;

    try {
        const get = id => document.getElementById(id).value.trim();
        const data = {
            license_key: get('license_key'), subject: get('subject'), grade: get('grade'),
            semester: get('semester'), exam_type: get('exam_type'), time: get('time_limit'),
            use_short_answer: document.getElementById('use_short').checked,
            totalPeriodsHalf1: parseInt(document.getElementById('total_half1').value) || 0,
            totalPeriodsHalf2: parseInt(document.getElementById('total_half2').value) || 0,
            topics: []
        };
        
        document.querySelectorAll('.topic-item').forEach(r => {
            const n = r.querySelector('.topic-name').value;
            const c = r.querySelector('.topic-content').value;
            if(n) data.topics.push({name:n, content:c, p1: 0, p2: 0});
        });

        if(data.topics.length===0) throw new Error("Chưa nhập chủ đề!");

        const res = await fetch('/api_matrix', {method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify(data)});
        if(!res.ok) throw new Error("Lỗi Server AI");

        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let fullHTML = "";
        while(true) {
            const {done, value} = await reader.read();
            if(done) break;
            fullHTML += decoder.decode(value, {stream:true});
        }
        
        // GIỮ LẠI TOÀN BỘ NỘI DUNG, chỉ xóa markdown block.
        let finalContent = fullHTML.replace(/```html/g, '').replace(/```/g, '').trim();

        prev.innerHTML = finalContent;
        window.generatedHTML = finalContent; // LƯU TOÀN BỘ NỘI DUNG HTML
        
        sec.classList.remove('hidden'); 
        sec.scrollIntoView({behavior:'smooth'});

    } catch(e) { error.innerText = "Lỗi: " + e.message; } 
    finally { loading.classList.add('hidden'); btn.disabled = false; }
}

// --- LOGIC XUẤT FILE DOCX VÀ FIX LỖI BẢNG ---
async function handleDownloadWord() {
    if(!window.generatedHTML) { alert("Chưa có nội dung!"); return; }
    
    if (typeof docx === 'undefined') {
        alert("Lỗi: Thư viện DOCX chưa tải xong."); return;
    }
    if (typeof temml === 'undefined') {
        alert("Lỗi: Thư viện Temml (xử lý toán) chưa tải xong."); return;
    }


    const btn = document.getElementById('btnDownloadWord');
    btn.innerText = "Đang tạo file..."; btn.disabled = true;

    try {
        // Lấy từ biến Global
        const { Document, Packer, Paragraph, Table, TableCell, TableRow, WidthType, TextRun, Math: MathObj, MathRun, MathFraction, MathSuperScript, MathSubScript, MathRadical, BorderStyle, HeadingLevel, AlignmentType } = window.docx;
        
        // Hàm Map Heading Level
        const getHeadingLevel = (tag) => {
            const map = { 'H1': HeadingLevel.HEADING_1, 'H2': HeadingLevel.HEADING_2, 'H3': HeadingLevel.HEADING_3, 'H4': HeadingLevel.HEADING_4, 'H5': HeadingLevel.HEADING_5, 'H6': HeadingLevel.HEADING_6 };
            return map[tag] || HeadingLevel.NORMAL;
        };

        // 1. Hàm đệ quy: XML Node -> Docx Math Object
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
                    case 'msqrt': results.push(new MathRadical({ children: children })); break;
                    case 'mrow': case 'mstyle': results.push(...children); break;
                    default: results.push(...children); break;
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
                            // Fallback (Đã fix lỗi Hex Color)
                            runs.push(new TextRun({ text: part, bold: true, color: "2E75B6" }));
                        }
                    } catch (e) { 
                        // Lỗi parse
                        runs.push(new TextRun({ text: `(Lỗi CT: ${part})`, color: "FF0000" })); 
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
            
            // 1. Xử lý Tiêu đề (H1, H2, H3...)
            if (tagName.match(/^H[1-6]$/)) {
                docChildren.push(new Paragraph({
                    children: parseContent(innerHTML)[0].root.children,
                    heading: getHeadingLevel(tagName),
                    alignment: AlignmentType.LEFT,
                    spacing: { before: 200, after: 100 }
                }));
            } 
            // 2. Xử lý Bảng
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
            // 3. Xử lý Đoạn văn (P, DIV, LI - nội dung câu hỏi/đáp án)
            else if (el.innerText.trim()) {
                docChildren.push(...parseContent(innerHTML));
            }
        });

        const doc = new Document({ sections: [{ children: docChildren }] });
        const blob = await Packer.toBlob(doc);
        saveAs(blob, `De_Thi_Full_${Date.now()}.docx`);

    } catch(e) {
        alert("Lỗi xuất file: " + e.message);
        console.error(e);
    } finally {
        btn.innerText = "TẢI VỀ WORD (NATIVE EQUATION)";
        btn.disabled = false;
    }
}
