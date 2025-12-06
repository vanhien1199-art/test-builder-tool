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

        // --- KHAI BÁO BIẾN TOÀN CỤC ---
    window.generatedHTML = "";

    document.addEventListener('DOMContentLoaded', () => {
        addTopicRow();
        document.getElementById('btnGenerate').addEventListener('click', handleGenerate);
        document.getElementById('btnDownloadWord').addEventListener('click', handleDownloadWord);
        
        const examType = document.getElementById('exam_type');
        examType.addEventListener('change', function() {
            const isHK = this.value === 'hk';
            const cfg = document.getElementById('hk-config');
            if(cfg) isHK ? cfg.classList.remove('hidden') : cfg.classList.add('hidden');
            document.querySelectorAll('.hk-period-inputs').forEach(d => isHK ? d.classList.remove('hidden') : d.classList.add('hidden'));
        });
    });

    function addTopicRow() {
        const box = document.getElementById('topics-container');
        const tpl = document.getElementById('topic-template');
        const clone = tpl.content.cloneNode(true);
        box.appendChild(clone);
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
                semester: '1', exam_type: 'gk', time: '45', use_short_answer: false, totalPeriodsHalf1: 0, totalPeriodsHalf2: 0,
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
            
            // LỌC RÁC: Chỉ xóa markdown block. GIỮ LẠI TOÀN BỘ NỘI DUNG
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

            // 1. Hàm đệ quy: XML Node -> Docx Math Object (Giữ nguyên logic cũ)
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
                                runs.push(new TextRun({ text: part, bold: true, color: "2E75B6" }));
                            }
                        } catch (e) { 
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
                        children: parseContent(innerHTML)[0].root.children, // Lấy runs từ parseContent
                        heading: getHeadingLevel(tagName),
                        alignment: AlignmentType.LEFT, // Mặc định là Left, có thể thêm logic center nếu có style
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
                // 3. Xử lý Đoạn văn (P, DIV, LI - thường là nội dung câu hỏi/đáp án)
                else if (el.innerText.trim()) {
                    // Dùng parseContent để xử lý LaTeX/Text
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
            btn.innerText = "TẢI FILE WORD (.DOCX)"; btn.disabled = false;
        }
    }
