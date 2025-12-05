document.addEventListener('DOMContentLoaded', () => {
    // Check file
    if (typeof docx === 'undefined') {
        alert("CẢNH BÁO: Vẫn chưa tìm thấy file 'js/docx.js'. Bạn hãy chắc chắn đã tải file về và lưu đúng tên.");
    }
    
    addTopicRow();
    
    const on = (id, e, f) => document.getElementById(id) && document.getElementById(id).addEventListener(e, f);
    on('btnAddTopic', 'click', addTopicRow);
    on('btnGenerate', 'click', handleGenerate);
    on('btnDownloadWord', 'click', handleDownloadWord);
    
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

function addTopicRow() {
    const box = document.getElementById('topics-container');
    const tpl = document.getElementById('topic-template');
    if(!box || !tpl) return;
    const node = tpl.content.cloneNode(true);
    box.appendChild(node);
    box.lastElementChild.querySelector('.remove-topic-btn').onclick = function() { this.parentElement.remove(); };
    if(document.getElementById('exam_type').value === 'hk') box.lastElementChild.querySelector('.hk-period-inputs').classList.remove('hidden');
}

async function handleGenerate() {
    const btn = document.getElementById('btnGenerate');
    const loading = document.getElementById('loadingMsg');
    const error = document.getElementById('errorMsg');
    const preview = document.getElementById('previewContent');
    const sec = document.getElementById('previewSection');

    loading.classList.remove('hidden'); error.classList.add('hidden'); sec.classList.add('hidden');
    preview.innerHTML = ""; btn.disabled = true;

    try {
        const get = (id) => document.getElementById(id).value.trim();
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
        if(data.topics.length===0) throw new Error("Chưa nhập chủ đề!");
        const res = await fetch('/api_matrix', {method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify(data)});
        if(!res.ok) throw new Error("Lỗi Server");
        sec.classList.remove('hidden'); sec.scrollIntoView({behavior:'smooth'});
        const reader = res.body.getReader(); const dec = new TextDecoder();
        while(true) {
            const {done, value} = await reader.read();
            if(done) break;
            preview.innerHTML += dec.decode(value, {stream:true}).replace(/```html/g,'').replace(/```/g,'');
        }
        window.generatedHTML = preview.innerHTML;
    } catch(e) { error.innerHTML = e.message; error.classList.remove('hidden'); } finally { loading.classList.add('hidden'); btn.disabled = false; }
}

async function handleDownloadWord() {
    if(typeof docx === 'undefined') { alert("Lỗi: Không tìm thấy thư viện docx.js trong máy."); return; }
    if(!window.generatedHTML) { alert("Chưa có nội dung!"); return; }

    const btn = document.getElementById('btnDownloadWord');
    const oldText = btn.innerHTML;
    btn.innerHTML = "Đang tạo..."; btn.disabled = true;

    try {
        const { Document, Packer, Paragraph, Table, TableCell, TableRow, WidthType, BorderStyle, HeadingLevel, TextRun, AlignmentType, Math: MathObj, MathRun, MathFraction, MathSuperScript, MathSubScript, MathRadical } = docx;

        function cvtXml(node) {
            if(!node) return []; const res=[];
            node.childNodes.forEach(c => {
                if(c.nodeType===3) { if(c.nodeValue.trim()) res.push(new MathRun(c.nodeValue)); return; }
                const t=c.tagName.toLowerCase(), k=cvtXml(c);
                if(t==='mfrac'&&k.length>=2) res.push(new MathFraction({numerator:[k[0]],denominator:[k[1]]}));
                else if(t==='msup'&&k.length>=2) res.push(new MathSuperScript({children:[k[0]],superScript:[k[1]]}));
                else if(t==='msub'&&k.length>=2) res.push(new MathSubScript({children:[k[0]],subScript:[k[1]]}));
                else if(t==='msqrt') res.push(new MathRadical({children:k}));
                else res.push(...k);
            });
            return res;
        }

        const parse = (html) => {
            const parts = html.split(/\$\$(.*?)\$\$/g), runs=[];
            parts.forEach((p,i) => {
                if(i%2===1) {
                    try {
                        if(typeof temml !== 'undefined') {
                            const xml = temml.renderToString(p, {xml:true});
                            const doc = new DOMParser().parseFromString(xml,"text/xml");
                            runs.push(new MathObj({children: cvtXml(doc.getElementsByTagName("math")[0])}));
                        } else runs.push(new TextRun({text:p, bold:true, color:"blue"}));
                    } catch(e) { runs.push(new TextRun({text:`$$${p}$$`, color:"red"})); }
                } else {
                    const t = p.replace(/<[^>]*>?/gm,"").replace(/&nbsp;/g," ");
                    if(t) runs.push(new TextRun(t));
                }
            });
            return runs;
        };

        const parser = new DOMParser();
        const docHtml = parser.parseFromString(window.generatedHTML, 'text/html');
        const children = [new Paragraph({text: "ĐỀ KIỂM TRA", heading: HeadingLevel.HEADING_1, alignment: AlignmentType.CENTER})];

        Array.from(docHtml.body.children).forEach(el => {
            if(['H2','H3','H4'].includes(el.tagName)) children.push(new Paragraph({text:el.innerText, heading: HeadingLevel.HEADING_2, spacing:{before:200,after:100}}));
            else if(el.tagName==='TABLE') {
                const rows = Array.from(el.querySelectorAll('tr')).map(tr => new TableRow({children: Array.from(tr.querySelectorAll('td,th')).map(td => new TableCell({children:[new Paragraph({children:parse(td.innerHTML)})], width:{size:100,type:WidthType.PERCENTAGE}, borders:{top:{style:BorderStyle.SINGLE,size:1},bottom:{style:BorderStyle.SINGLE,size:1},left:{style:BorderStyle.SINGLE,size:1},right:{style:BorderStyle.SINGLE,size:1}} }))}));
                children.push(new Table({rows:rows, width:{size:100,type:WidthType.PERCENTAGE}})); children.push(new Paragraph({text:""}));
            } else if(el.innerText.trim()) children.push(new Paragraph({children:parse(el.innerHTML)}));
        });

        const doc = new Document({sections:[{children:children}]});
        const blob = await Packer.toBlob(doc);
        saveAs(blob, `De_Thi_${Date.now()}.docx`);
    } catch(e) { alert("Lỗi: "+e.message); } finally { btn.innerHTML=oldText; btn.disabled=false; }
}
