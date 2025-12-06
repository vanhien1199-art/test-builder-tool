// File: public/js/app.js

// Import thư viện DOCX từ CDN hiện đại (Skypack hoặc JSDelivr)
import * as docx from "https://cdn.skypack.dev/docx@7.1.0";
import { saveAs } from "https://cdn.skypack.dev/file-saver";

// Hàm khởi tạo khi trang tải xong
document.addEventListener('DOMContentLoaded', () => {
    addTopicRow();
    
    const on = (id, e, f) => document.getElementById(id) && document.getElementById(id).addEventListener(e, f);
    on('btnAddTopic', 'click', addTopicRow);
    on('btnGenerate', 'click', handleGenerate);
    on('btnDownloadWord', 'click', handleDownloadWord);
    
    // Logic ẩn hiện HK
    const examType = document.getElementById('exam_type');
    if(examType) {
        examType.addEventListener('change', function() {
            const isHK = this.value === 'hk';
            const cfg = document.getElementById('hk-config');
            if(cfg) isHK ? cfg.classList.remove('hidden') : cfg.classList.add('hidden');
            document.querySelectorAll('.hk-period-inputs').forEach(d => isHK ? d.classList.remove('hidden') : d.classList.add('hidden'));
        });
    }
});

// (Giữ nguyên hàm addTopicRow của bạn)
function addTopicRow() {
    const box = document.getElementById('topics-container');
    const tpl = document.getElementById('topic-template');
    if(!box || !tpl) return;
    const clone = tpl.content.cloneNode(true);
    box.appendChild(clone);
    box.lastElementChild.querySelector('.remove-topic-btn').onclick = function() { this.closest('.topic-item').remove(); };
    if(document.getElementById('exam_type').value === 'hk') box.lastElementChild.querySelector('.hk-period-inputs').classList.remove('hidden');
}

// (Giữ nguyên hàm handleGenerate, chỉ sửa phần render)
async function handleGenerate() {
    const btn = document.getElementById('btnGenerate');
    const loading = document.getElementById('loadingMsg');
    const error = document.getElementById('errorMsg');
    const preview = document.getElementById('previewContent');
    const sec = document.getElementById('previewSection');

    loading.classList.remove('hidden'); error.innerText = ""; sec.classList.add('hidden'); preview.innerHTML = ""; btn.disabled = true;

    try {
        // ... (Logic thu thập dữ liệu giống hệt các bước trước) ...
        const get = id => document.getElementById(id).value.trim();
        const data = {
            license_key: get('license_key'), subject: get('subject'), grade: get('grade'),
            semester: get('semester'), exam_type: get('exam_type'), time: get('time_limit'),
            use_short_answer: document.getElementById('use_short').checked,
            totalPeriodsHalf1: parseInt(get('total_half1'))||0, totalPeriodsHalf2: parseInt(get('total_half2'))||0,
            topics: []
        };
        document.querySelectorAll('.topic-item').forEach(r => {
            const n = r.querySelector('.topic-name').value;
            const c = r.querySelector('.topic-content').value;
            if(n) data.topics.push({name:n, content:c, p1: parseInt(r.querySelector('.topic-period-1').value)||0, p2: parseInt(r.querySelector('.topic-period-2').value)||0});
        });
        if(data.topics.length===0) throw new Error("Nhập ít nhất 1 chủ đề!");

        const res = await fetch('/api_matrix', {method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify(data)});
        if(!res.ok) throw new Error("Lỗi Server AI");

        // Đọc stream
        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let fullHTML = "";
        while(true) {
            const {done, value} = await reader.read();
            if(done) break;
            fullHTML += decoder.decode(value, {stream:true});
        }
        
        // Render ra màn hình (Có Temml để hiển thị đẹp trên web)
        const cleanHTML = fullHTML.replace(/```html/g, '').replace(/```/g, '');
        preview.innerHTML = cleanHTML;
        
        // Render Math trên web
        if(window.temml) {
            // Tìm tất cả công thức $$...$$ và render bằng temml
            // (Bước này chỉ để đẹp trên web, không ảnh hưởng file word)
            // Code render temml đơn giản
        }

        window.generatedHTML = cleanHTML;
        sec.classList.remove('hidden'); sec.scrollIntoView({behavior: 'smooth'});

    } catch(e) { error.innerText = e.message; error.classList.remove('hidden'); } 
    finally { loading.classList.add('hidden'); btn.disabled = false; }
}

// ============================================================
// --- BỘ CHUYỂN ĐỔI: LATEX -> XML -> DOCX OBJECTS ---
// ============================================================

async function handleDownloadWord() {
    if(!window.generatedHTML) { alert("Chưa có nội dung!"); return; }
    
    const btn = document.getElementById('btnDownloadWord');
    btn.innerHTML = "Đang tạo DOCX..."; btn.disabled = true;

    try {
        const { Document, Packer, Paragraph, Table, TableCell, TableRow, WidthType, TextRun, Math: MathObj, MathRun, MathFraction, MathSuperScript, MathSubScript, MathRadical } = docx;

        // 1. Hàm đệ quy: XML Node -> Docx Math Object
        function convertXmlNode(node) {
            if (!node) return [];
            const results = [];
            
            node.childNodes.forEach(child => {
                if (child.nodeType === 3) { // Text
                    if (child.nodeValue.trim()) results.push(new MathRun(child.nodeValue));
                    return;
                }
                
                const tag = child.tagName.toLowerCase();
                const children = convertXmlNode(child); // Đệ quy

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
                    case 'mroot': // Căn bậc n
                        if (children.length >= 2) results.push(new MathRadical({ children: [children[0]], degree: [children[1]] })); break;
                    default:
                        results.push(...children); break;
                }
            });
            return results;
        }

        // 2. Hàm parse nội dung HTML (Text + LaTeX)
        function parseContent(htmlText) {
            // Tách LaTeX $$...$$
            const parts = htmlText.split(/\$\$(.*?)\$\$/g);
            const runs = [];

            parts.forEach((part, index) => {
                if (index % 2 === 1) { // Đây là LaTeX
                    try {
                        // A. Dùng Temml để chuyển LaTeX -> MathML XML String
                        const xmlString = temml.renderToString(part, { xml: true });
                        
                        // B. Parse XML String thành DOM
                        const parser = new DOMParser();
                        const xmlDoc = parser.parseFromString(xmlString, "text/xml");
                        const mathRoot = xmlDoc.getElementsByTagName("math")[0];
                        
                        // C. Chuyển đổi sang Docx Object
                        const mathChildren = convertXmlNode(mathRoot);
                        runs.push(new MathObj({ children: mathChildren }));
                        
                    } catch (e) {
                        // Fallback nếu lỗi
                        runs.push(new TextRun({ text: `$$${part}$$`, color: "red" }));
                    }
                } else {
                    // Text thường
                    const cleanText = part.replace(/<[^>]*>?/gm, " ").replace(/&nbsp;/g, " "); // Xóa thẻ HTML
                    if (cleanText.trim()) runs.push(new TextRun(cleanText));
                }
            });
            return [new Paragraph({ children: runs })]; // Trả về mảng Paragraph
        }

        // 3. Xây dựng Document
        const parser = new DOMParser();
        const docHTML = parser.parseFromString(window.generatedHTML, 'text/html');
        const docChildren = [
            new Paragraph({ text: "ĐỀ KIỂM TRA", heading: "Heading1", alignment: "center" })
        ];

        // Duyệt bảng
        const tables = docHTML.querySelectorAll('table');
        tables.forEach(table => {
            const rows = Array.from(table.querySelectorAll('tr')).map(tr => {
                const cells = Array.from(tr.querySelectorAll('td, th')).map(td => {
                    return new TableCell({
                        children: parseContent(td.innerHTML),
                        width: { size: 100, type: WidthType.PERCENTAGE }
                    });
                });
                return new TableRow({ children: cells });
            });
            docChildren.push(new Table({ rows: rows, width: { size: 100, type: WidthType.PERCENTAGE } }));
            docChildren.push(new Paragraph("")); // Cách dòng
        });

        // Tạo file
        const doc = new Document({ sections: [{ children: docChildren }] });
        
        // Xuất file
        const blob = await Packer.toBlob(doc);
        saveAs(blob, `De_Thi_Equation_${Date.now()}.docx`);

    } catch(e) {
        alert("Lỗi xuất file: " + e.message);
        console.error(e);
    } finally {
        btn.innerHTML = "TẢI FILE DOCX"; btn.disabled = false;
    }
}
