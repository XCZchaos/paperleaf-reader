from reportlab.pdfgen import canvas
from reportlab.lib.colors import HexColor
from reportlab.lib.utils import simpleSplit
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
for name,file in [('Times-Roman','DejaVuSerif.ttf'),('Times-Italic','DejaVuSerif.ttf'),('Times-Bold','DejaVuSerif-Bold.ttf'),('Helvetica','DejaVuSans.ttf'),('STSong-Light','DejaVuSans.ttf')]:
 pdfmetrics.registerFont(TTFont(name,'/usr/share/fonts/truetype/dejavu/'+file))
c=canvas.Canvas('public/guide.pdf',pagesize=(595,842))
c.setTitle('Paperleaf - A Practical Guide to Reading Research Papers')
c.setAuthor('Paperleaf')
ink=HexColor('#35442e');muted=HexColor('#839275');green=HexColor('#6e8858')
def page(num,label):
 c.setFillColor(HexColor('#fdfdf8'));c.rect(0,0,595,842,fill=1,stroke=0)
 c.setFillColor(green);c.setFont('Helvetica',9);c.drawString(55,788,'PAPERLEAF   /   READING COMPANION')
 c.setStrokeColor(HexColor('#dce3d3'));c.line(55,770,540,770)
 c.setFont('Helvetica',8);c.setFillColor(muted);c.drawString(55,40,'An original product guide. Not a scientific publication.');c.drawRightString(540,40,f'{num} / 3')
 c.bookmarkPage(label);c.addOutlineEntry(label,label,0,False)
def para(t,y,font='Times-Roman',size=11,leading=18):
 c.setFillColor(ink);c.setFont(font,size)
 for line in simpleSplit(t,font,size,480):c.drawString(55,y,line);y-=leading
 return y
page(1,'1. Read with a question')
c.setFillColor(green);c.setFont('Helvetica',9);c.drawString(55,730,'01  /  GETTING STARTED')
y=para('A Practical Guide to',690,'Times-Roman',29,35);y=para('Reading Research Papers',y,'Times-Roman',29,35)
y=para('YOUR PERSONAL RESEARCH WORKSPACE',y-12,'STSong-Light',10,24)
y=para('Welcome to your quiet research space.',y-37,'Times-Italic',16,24)
y=para('Reading a research paper is an active process. Start with a clear question, identify the central claim, and examine the evidence before accepting the conclusion. A useful note connects the author\'s ideas with your own research questions.',y-18)
c.setFillColor(HexColor('#edf3e4'));c.roundRect(55,y-89,485,74,6,fill=1,stroke=0)
y=para('Connect Codex, then select a passage and click GPT Translate.',y-40,'Helvetica',11,20)
y=para('View the Chinese translation in the side panel.',y-4,'STSong-Light',11,20)
y=para('1. Import your paper',y-65,'Times-Bold',17,26)
y=para('Sign in to Codex for smart import. GPT reads the first three pages, identifies the title, authors and other details, then names your PDF. The original filename is retained. Review the details, add tags, and organize papers into topics.',y-8)
y=para('2. Begin with the big picture',y-25,'Times-Bold',17,26)
y=para('Read the title, abstract and conclusion first. Ask what problem the work addresses and why that problem matters. Use the table of contents or text search to locate the sections you need.',y-8)
c.showPage()
page(2,'2. Translate and annotate')
y=para('Read in English.',718,'Times-Roman',30,37);y=para('Think in your own words.',y,'Times-Roman',30,37)
y=para('A bilingual companion for your reading.',y-14,'STSong-Light',14,25)
y=para('3. Translate a passage',y-30,'Times-Bold',18,28)
y=para('Select a sentence or a paragraph and use the translation action. The side panel shows the English source and a Chinese translation. You can edit the translation before saving both versions as a note.',y-7)
y=para('Sign in through the local Codex companion. Automatic translation follows your selection. Continuous mode keeps earlier passages across pages. Requests use your Codex quota; verify terms against the source.',y-13)
y=para('4. Leave a trace of your thinking',y-20,'Times-Bold',18,28)
y=para('Highlight a useful passage and add a comment. Record questions, assumptions and possible connections. Notes are linked to a page, making it easy to return to the original context.',y-7)
y=para('The reader keeps unfinished drafts in this browser. Press Save, or Ctrl / Command + Enter, to store a note in the cloud. Saved highlights and notes are available when you return.',y-13)
y=para('A useful note asks:',y-20,'Times-Bold',18,28)
for t in ['What is the main research question?','How does the method differ from existing approaches?','Which experiments support the claim?','What are the limitations and open questions?','How could I reproduce or extend this work?']:
 y=para('- '+t,y-5,'Times-Roman',11,18)
c.showPage()
page(3,'3. Connect your ideas')
y=para('Build a library of ideas,',718,'Times-Roman',29,37);y=para('not just a folder of files.',y,'Times-Roman',29,37)
y=para('Make knowledge your own.',y-14,'STSong-Light',14,25)
y=para('5. Organize with intention',y-35,'Times-Bold',18,28)
y=para('Create a research topic for a question you care about. Add a few meaningful tags to each paper, mark important papers as favorites, and use reading status to distinguish what you plan to read from what you have finished.',y-7)
y=para('6. Ask, summarize and present',y-28,'Times-Bold',18,28)
y=para('Ask GPT about a selected passage or a page range. Generate a structured reading summary or a presentation. Review its page citations, edit the slide content and download an editable PPTX with speaker notes. Check all claims against the original paper.',y-7)
y=para('A few practical details',y-30,'Times-Bold',18,28)
for t in ['PDF files, saved notes and reading progress are stored in the cloud.','Use the left and right arrow keys to turn pages.','Use the slash key in the library to focus the search field.','Scanned documents can be read, but text selection requires a text layer.','The original PDF can be downloaded from the reader toolbar.']:
 y=para('- '+t,y-8,'Times-Roman',11,18)
c.setFillColor(HexColor('#edf3e4'));c.roundRect(55,77,485,65,6,fill=1,stroke=0)
para('Read. Reflect. Connect.',116,'Times-Italic',20,28)
para('A home for your ideas.',93,'STSong-Light',12,20)
c.save()
