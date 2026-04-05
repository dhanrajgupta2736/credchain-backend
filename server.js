// CredChain Backend — server.js v4
// Correct 2-step API flow discovered via Network tab inspection:
// Step 1: POST action=fetch_exam_list → get exam_code
// Step 2: POST action=fetch_result   → get actual result HTML

const express = require('express');
const axios   = require('axios');
const cheerio = require('cheerio');
const cors    = require('cors');

const app  = express();
const PORT = process.env.PORT || 3000;

const corsOptions = {
  origin: '*',
  methods: ['GET', 'POST', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  optionsSuccessStatus: 204
};
app.use(cors(corsOptions));
app.options('*', cors(corsOptions));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

const BROWSER_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Accept': '*/*',
  'Accept-Language': 'en-IN,en;q=0.9',
  'Origin':  'https://www.sandipuniversity.edu.in',
  'Referer': 'https://www.sandipuniversity.edu.in/result/display_new.php',
  'X-Requested-With': 'XMLHttpRequest',
  'Content-Type': 'application/x-www-form-urlencoded',
};

const API_URL = 'https://www.sandipuniversity.edu.in/api/result_api_new.php';

// ── Health check ──────────────────────────────────────────────
app.get('/', (req, res) => {
  res.json({ status: 'CredChain backend running', version: '4.0' });
});

// ── Main endpoint ─────────────────────────────────────────────
app.post('/fetch-result', async (req, res) => {
  const { prn, dob } = req.body;

  if (!prn || !dob)
    return res.status(400).json({ success: false, error: 'PRN and DOB required.' });
  if (!/^\d{12}$/.test(prn.trim()))
    return res.status(400).json({ success: false, error: 'PRN must be 12 digits.' });
  if (!/^\d{2}-\d{2}-\d{4}$/.test(dob.trim()))
    return res.status(400).json({ success: false, error: 'DOB must be DD-MM-YYYY.' });

  try {
    // ── STEP 1: fetch_exam_list → get exam_code ─────────────
    console.log(`[Step 1] Fetching exam list for PRN: ${prn}`);

    const step1 = await axios.post(
      API_URL,
      new URLSearchParams({
        action:  'fetch_exam_list',
        prn:     prn.trim(),
        dob:     dob.trim(),
        exam_id: '',
      }),
      { headers: BROWSER_HEADERS, timeout: 15000 }
    );

    console.log(`[Step 1] Response type: ${typeof step1.data}`);
    console.log(`[Step 1] Raw response: ${JSON.stringify(step1.data).substring(0, 500)}`);

    // Response could be JSON array or HTML
    let examCode  = '';
    let examTitle = '';

    if (typeof step1.data === 'object' && Array.isArray(step1.data)) {
      // JSON array of exam objects: [{exam_code, exam_name, ...}]
      const first = step1.data[0];
      if (first) {
        examCode  = first.exam_code || first.code || first.id || Object.values(first)[0];
        examTitle = first.exam_name || first.name || first.title || Object.values(first)[1] || '';
        console.log(`[Step 1] JSON array — exam_code: ${examCode}`);
      }
    } else if (typeof step1.data === 'object' && !Array.isArray(step1.data)) {
      // JSON object: {exam_code: '...', exam_name: '...'}
      examCode  = step1.data.exam_code || step1.data.code || step1.data.id || '';
      examTitle = step1.data.exam_name || step1.data.name || '';
      // Could also be {data: [{...}]}
      if (!examCode && step1.data.data && Array.isArray(step1.data.data)) {
        const first = step1.data.data[0];
        examCode  = first.exam_code || first.code || first.id || '';
        examTitle = first.exam_name || first.name || '';
      }
      console.log(`[Step 1] JSON object — exam_code: ${examCode}`);
    } else {
      // HTML response — parse it
      const html1 = String(step1.data);
      const $1 = cheerio.load(html1);

      // Look for loadResult('CODE') or similar in onclick
      $1('[onclick]').each((i, el) => {
        if (examCode) return;
        const onclick = $1(el).attr('onclick') || '';
        const match = onclick.match(/(?:loadResult|fetchResult|getResult|showResult)\s*\(\s*['"]([^'"]+)['"]/);
        if (match) {
          examCode  = match[1];
          examTitle = $1(el).text().trim();
          console.log(`[Step 1] HTML onclick — exam_code: ${examCode}`);
        }
      });

      // Fallback: any alphanumeric code 10+ chars in onclick
      if (!examCode) {
        $1('[onclick]').each((i, el) => {
          if (examCode) return;
          const onclick = $1(el).attr('onclick') || '';
          const match = onclick.match(/['"]([A-Z][A-Z0-9]{9,})['"]/);
          if (match) {
            examCode = match[1];
            console.log(`[Step 1] HTML fallback — exam_code: ${examCode}`);
          }
        });
      }

      // Fallback: look for data-* attributes
      if (!examCode) {
        $1('[data-exam_code],[data-examcode],[data-code],[data-id]').each((i, el) => {
          if (examCode) return;
          examCode = $1(el).attr('data-exam_code') || $1(el).attr('data-examcode') ||
                     $1(el).attr('data-code') || $1(el).attr('data-id') || '';
          if (examCode) console.log(`[Step 1] data-attr — exam_code: ${examCode}`);
        });
      }
    }

    if (!examCode) {
      console.log(`[Step 1] FAILED — full response: ${JSON.stringify(step1.data).substring(0, 1000)}`);
      return res.json({
        success: false,
        error: 'No exam session found for this PRN/DOB. Results may not be published yet.'
      });
    }

    // ── STEP 2: fetch_result → get actual marksheet ─────────
    console.log(`[Step 2] Fetching result with exam_code: ${examCode}`);

    const step2 = await axios.post(
      API_URL,
      new URLSearchParams({
        action:    'fetch_result',
        prn:       prn.trim(),
        exam_code: examCode,
        dob:       dob.trim(),
      }),
      { headers: BROWSER_HEADERS, timeout: 15000 }
    );

    const html = typeof step2.data === 'string' ? step2.data : JSON.stringify(step2.data);
    const $    = cheerio.load(html);

    // ── Parse student info ──────────────────────────────────
    let studentName  = '';
    let degreeBranch = '';
    let parsedPRN    = '';

    $('table tr').each((i, row) => {
      const cells = $(row).find('td');
      if (cells.length >= 2) {
        const label = $(cells[0]).text().trim().toLowerCase();
        const value = $(cells[1]).text().trim();
        if (label.includes('prn'))                          parsedPRN    = value;
        if (label.includes('student') || label.includes('name')) {
          if (!studentName) studentName = value;
        }
        if (label.includes('degree') || label.includes('branch')) {
          if (!degreeBranch) degreeBranch = value;
        }
      }
    });

    if (!studentName) {
      console.log(`[Step 2] Parse failed. HTML: ${html.substring(0, 1000)}`);
      return res.json({ success: false, error: 'Could not parse result. Please try again.' });
    }

    // ── Parse subjects ──────────────────────────────────────
    const subjects = [];
    let sgpa = '';
    let semester = '';

    $('table').each((i, table) => {
      const headerText = $(table).find('tr').first().text().toLowerCase();
      if (headerText.includes('course') || (headerText.includes('sem') && headerText.includes('grade'))) {
        $(table).find('tr').each((j, row) => {
          if (j === 0) return;
          const cells = $(row).find('td');
          if (cells.length >= 6) {
            const sem        = $(cells[0]).text().trim();
            const code       = $(cells[1]).text().trim();
            const name       = $(cells[2]).text().trim();
            const type       = $(cells[3]).text().trim();
            const credits    = $(cells[4]).text().trim();
            const grade      = $(cells[5]).text().trim();
            const revalGrade = cells.length >= 7 ? $(cells[6]).text().trim() : '';
            const result     = cells.length >= 8 ? $(cells[7]).text().trim() : '';
            if (code && name) {
              if (!semester && sem) semester = sem;
              subjects.push({ sem, code, name, type, credits, grade, revalGrade, result });
            }
          }
        });
      }
    });

    // SGPA — scan all text nodes for "SEM:3, GPA : 8.17" pattern
    $('td, div, p, span, h1, h2, h3, h4, h5, b, strong').each((i, el) => {
      const txt = $(el).clone().children().remove().end().text().trim()
                  || $(el).text().trim();
      if (txt.match(/GPA\s*[:\-,]\s*[\d.]+/i)) {
        const gpaMatch = txt.match(/GPA\s*[:\-,]\s*([\d.]+)/i);
        const semMatch = txt.match(/SEM\s*[:\-,]\s*(\d+)/i);
        if (gpaMatch && !sgpa)     sgpa     = gpaMatch[1];
        if (semMatch && !semester) semester = semMatch[1];
      }
    });

    // ── Grade label for blockchain ──────────────────────────
    let gradeLabel = '';
    const gpaNum = parseFloat(sgpa);
    if (!isNaN(gpaNum)) {
      if      (gpaNum >= 9.0) gradeLabel = `O (GPA: ${sgpa})`;
      else if (gpaNum >= 8.0) gradeLabel = `A+ (GPA: ${sgpa})`;
      else if (gpaNum >= 7.0) gradeLabel = `A (GPA: ${sgpa})`;
      else if (gpaNum >= 6.0) gradeLabel = `B+ (GPA: ${sgpa})`;
      else if (gpaNum >= 5.5) gradeLabel = `B (GPA: ${sgpa})`;
      else                    gradeLabel = `Pass (GPA: ${sgpa})`;
    } else {
      gradeLabel = subjects.find(s => s.grade)?.grade || 'Pass';
    }

    console.log(`[Step 2] ✅ Success! ${studentName} | GPA: ${sgpa} | Subjects: ${subjects.length}`);

    return res.json({
      success: true,
      prn: parsedPRN || prn,
      studentName,
      degreeBranch,
      examTitle: examTitle || `Semester ${semester} Result`,
      semester,
      sgpa,
      gradeLabel,
      subjects,
    });

  } catch (err) {
    console.error('[Error]', err.message);
    if (err.code === 'ECONNREFUSED' || err.code === 'ENOTFOUND')
      return res.status(502).json({ success: false, error: 'Could not reach the university server.' });
    if (err.response?.status === 403 || err.response?.status === 429)
      return res.status(429).json({ success: false, error: 'University server rate limiting. Wait 30s and retry.' });
    return res.status(500).json({ success: false, error: 'Server error: ' + err.message });
  }
});

app.listen(PORT, () => console.log(`CredChain backend v4 running on port ${PORT}`));
