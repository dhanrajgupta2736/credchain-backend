// CredChain Backend — server.js v3
// Two-step fetch: PRN+DOB → get exam_code → fetch actual result
// Deploy on Railway: railway.app

const express = require('express');
const axios   = require('axios');
const cheerio = require('cheerio');
const cors    = require('cors');

const app  = express();
const PORT = process.env.PORT || 3000;

// CORS — allow all origins
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

// Shared axios headers that mimic a real browser
const BROWSER_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  'Accept-Language': 'en-IN,en;q=0.9',
  'Origin':  'https://www.sandipuniversity.edu.in',
  'Referer': 'https://www.sandipuniversity.edu.in/result/display_new.php',
};

// ── Health check ──────────────────────────────────────────────
app.get('/', (req, res) => {
  res.json({ status: 'CredChain backend running', version: '3.0' });
});

// ── Main endpoint ─────────────────────────────────────────────
app.post('/fetch-result', async (req, res) => {
  const { prn, dob } = req.body;

  if (!prn || !dob)
    return res.status(400).json({ success: false, error: 'PRN and date of birth are required.' });
  if (!/^\d{12}$/.test(prn.trim()))
    return res.status(400).json({ success: false, error: 'PRN must be a 12-digit number.' });
  if (!/^\d{2}-\d{2}-\d{4}$/.test(dob.trim()))
    return res.status(400).json({ success: false, error: 'Date of birth must be in DD-MM-YYYY format.' });

  try {
    // ── STEP 1: POST prn+dob → get the exam session list page ──
    console.log(`[Step 1] Fetching session list for PRN: ${prn}`);
    const step1 = await axios.post(
      'https://www.sandipuniversity.edu.in/result/display_new.php',
      new URLSearchParams({ prn: prn.trim(), dob: dob.trim() }),
      {
        headers: {
          ...BROWSER_HEADERS,
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        timeout: 15000,
        maxRedirects: 5,
      }
    );

    const $1 = cheerio.load(step1.data);

    // The exam row looks like:
    // <tr onclick="fetchResult('S26031219144839', '240105121011', '16-12-2006')">
    //   <td>ESE DEC-2025 (B.Tech CSE ...)</td>
    //   <td><button>Sem 3</button></td>
    // </tr>
    // We need to extract exam_code from the onclick or from a data attribute

    let examCode = '';
    let examTitle = '';

    // The exam row is an <a> with onclick="loadResult('EXAM_CODE')"
    // e.g. <a href="javascript:void(0)" onclick="loadResult('S26031219144839')">
    $1('a[onclick]').each((i, el) => {
      const onclick = $1(el).attr('onclick') || '';
      // Match loadResult('...') or fetchResult('...') or any similar pattern
      const match = onclick.match(/(?:loadResult|fetchResult|getResult)\s*\(\s*['"]([^'"]+)['"]/);
      if (match && !examCode) {
        examCode  = match[1];
        examTitle = $1(el).find('span').first().text().trim();
        console.log(`[Step 1] Matched via loadResult: ${examCode}`);
      }
    });

    // Fallback: any onclick on any element containing a code-like string
    if (!examCode) {
      $1('[onclick]').each((i, el) => {
        const onclick = $1(el).attr('onclick') || '';
        const match = onclick.match(/['"]([A-Z0-9]{10,})['"]/);
        if (match && !examCode) {
          examCode = match[1];
          console.log(`[Step 1] Matched via fallback onclick: ${examCode}`);
        }
      });
    }

    if (!examCode) {
      console.log('[Step 1] HTML snippet:', step1.data.substring(0, 2000));
      return res.json({
        success: false,
        error: 'Could not find exam session for this PRN. The university page may have changed or no results are published yet.'
      });
    }

    console.log(`[Step 1] Found exam_code: ${examCode} | title: ${examTitle}`);

    // ── STEP 2: POST to result_api_new.php with exam_code ──────
    console.log(`[Step 2] Fetching actual result...`);
    const step2 = await axios.post(
      'https://www.sandipuniversity.edu.in/api/result_api_new.php',
      new URLSearchParams({
        action:    'fetch_result',
        prn:       prn.trim(),
        exam_code: examCode,
        dob:       dob.trim(),
      }),
      {
        headers: {
          ...BROWSER_HEADERS,
          'Content-Type': 'application/x-www-form-urlencoded',
          'Referer': 'https://www.sandipuniversity.edu.in/result/display_new.php',
          'X-Requested-With': 'XMLHttpRequest',
        },
        timeout: 15000,
      }
    );

    const html = step2.data;
    const $    = cheerio.load(html);

    // ── Parse student info from result HTML ────────────────
    let studentName  = '';
    let degreeBranch = '';
    let parsedPRN    = '';

    $('table tr').each((i, row) => {
      const cells = $(row).find('td');
      if (cells.length >= 2) {
        const label = $(cells[0]).text().trim().toLowerCase();
        const value = $(cells[1]).text().trim();
        if (label.includes('prn'))      parsedPRN    = value;
        if (label.includes('student'))  studentName  = value;
        if (label.includes('degree'))   degreeBranch = value;
        if (label.includes('name') && !studentName) studentName = value;
      }
    });

    if (!studentName) {
      console.log('[Step 2] Could not parse student name. HTML:', html.substring(0, 1500));
      return res.json({
        success: false,
        error: 'Result fetched but could not parse student details. Please try again.'
      });
    }

    // ── Parse subjects table ───────────────────────────────
    const subjects = [];
    let sgpa = '';
    let semester = '';

    $('table').each((i, table) => {
      const headerText = $(table).find('tr').first().text().toLowerCase();
      if (headerText.includes('course') || headerText.includes('sem')) {
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

    // SGPA — "SEM:3, GPA : 8.17" or "GPA: 8.17"
    $('*').each((i, el) => {
      const txt = $(el).children().length === 0 ? $(el).text().trim() : '';
      if (txt.match(/GPA\s*[:\-]\s*[\d.]+/i)) {
        const gpaMatch = txt.match(/GPA\s*[:\-]\s*([\d.]+)/i);
        const semMatch = txt.match(/SEM\s*[:\-]\s*(\d+)/i);
        if (gpaMatch && !sgpa)     sgpa     = gpaMatch[1];
        if (semMatch && !semester) semester = semMatch[1];
      }
    });

    // ── Build grade label for blockchain ───────────────────
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

    console.log(`[Step 2] Success! Student: ${studentName}, GPA: ${sgpa}`);

    return res.json({
      success:     true,
      prn:         parsedPRN || prn,
      studentName,
      degreeBranch,
      examTitle:   examTitle || `Semester ${semester} Result`,
      semester,
      sgpa,
      gradeLabel,
      subjects,
    });

  } catch (err) {
    console.error('Fetch error:', err.message);
    if (err.code === 'ECONNREFUSED' || err.code === 'ENOTFOUND')
      return res.status(502).json({ success: false, error: 'Could not reach the university server. Try again.' });
    if (err.response?.status === 403 || err.response?.status === 429)
      return res.status(429).json({ success: false, error: 'University server is rate limiting. Wait 30 seconds and retry.' });
    return res.status(500).json({ success: false, error: 'Server error: ' + err.message });
  }
});

app.listen(PORT, () => {
  console.log(`CredChain backend v3 running on port ${PORT}`);
});
