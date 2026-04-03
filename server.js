// CredChain Backend — server.js
// Fetches Sandip University result, parses it, returns JSON
// Deploy free on Railway: railway.app

const express  = require('express');
const axios    = require('axios');
const cheerio  = require('cheerio');
const cors     = require('cors');

const app  = express();
const PORT = process.env.PORT || 3000;

// Allow requests from your domain + localhost for testing
app.use(cors({
  origin: ['http://localhost', 'http://127.0.0.1', '*'], // replace * with yourdomain.xyz in production
  methods: ['POST', 'GET']
}));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// ── Health check ─────────────────────────────────────────────
app.get('/', (req, res) => {
  res.json({ status: 'CredChain backend running', version: '2.0' });
});

// ── Main endpoint: fetch + parse university result ────────────
app.post('/fetch-result', async (req, res) => {
  const { prn, dob } = req.body;

  // Basic validation
  if (!prn || !dob) {
    return res.status(400).json({ success: false, error: 'PRN and date of birth are required.' });
  }

  if (!/^\d{12}$/.test(prn.trim())) {
    return res.status(400).json({ success: false, error: 'PRN must be a 12-digit number.' });
  }

  if (!/^\d{2}-\d{2}-\d{4}$/.test(dob.trim())) {
    return res.status(400).json({ success: false, error: 'Date of birth must be in DD-MM-YYYY format.' });
  }

  try {
    // POST to university result page
    const response = await axios.post(
      'https://www.sandipuniversity.edu.in/result/display_new.php',
      new URLSearchParams({ prn: prn.trim(), dob: dob.trim() }),
      {
        headers: {
          'Content-Type':  'application/x-www-form-urlencoded',
          'Referer':       'https://www.sandipuniversity.edu.in/result/display_new.php',
          'Origin':        'https://www.sandipuniversity.edu.in',
          'User-Agent':    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120',
          'Accept':        'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        },
        timeout: 15000,
        maxRedirects: 5,
      }
    );

    const html = response.data;
    const $    = cheerio.load(html);

    // ── Parse student info ──────────────────────────────────
    // The result table has rows: PRN, Student's Name, Degree & Branch
    let studentName = '';
    let degreeBranch = '';
    let examTitle = '';
    let parsedPRN = '';

    // Find the result section — look for the table with PRN row
    $('table').each((i, table) => {
      const rows = $(table).find('tr');
      rows.each((j, row) => {
        const cells = $(row).find('td');
        if (cells.length >= 2) {
          const label = $(cells[0]).text().trim().toLowerCase();
          const value = $(cells[1]).text().trim();
          if (label.includes('prn'))           parsedPRN    = value;
          if (label.includes("student"))       studentName  = value;
          if (label.includes('degree'))        degreeBranch = value;
        }
      });
    });

    // Exam title (ESE DEC-2025 etc) — usually in a heading/strong tag near RESULT
    $('h2, h3, h4, h5, strong, b').each((i, el) => {
      const txt = $(el).text().trim();
      if (txt.match(/ESE|DSE|B\.Tech|exam|semester/i) && txt.length < 120) {
        if (!examTitle) examTitle = txt;
      }
    });

    // If student name not found, result probably not available
    if (!studentName) {
      return res.json({
        success: false,
        error: 'No result found for this PRN and date of birth. Please check your details.'
      });
    }

    // ── Parse subject rows ──────────────────────────────────
    // Table columns: Sem | Course Code | Course Name | Course Type | Credits | Grade | Reval Grade | Result
    const subjects = [];
    let sgpa = '';
    let semester = '';

    $('table').each((i, table) => {
      const headerRow = $(table).find('tr').first();
      const headerText = headerRow.text().toLowerCase();

      // This is the subjects table if header contains 'sem' and 'course'
      if (headerText.includes('sem') && headerText.includes('course')) {
        $(table).find('tr').each((j, row) => {
          if (j === 0) return; // skip header row

          const cells = $(row).find('td');
          if (cells.length >= 7) {
            const sem        = $(cells[0]).text().trim();
            const code       = $(cells[1]).text().trim();
            const name       = $(cells[2]).text().trim();
            const type       = $(cells[3]).text().trim();
            const credits    = $(cells[4]).text().trim();
            const grade      = $(cells[5]).text().trim();
            const revalGrade = $(cells[6]).text().trim();
            const result     = cells.length >= 8 ? $(cells[7]).text().trim() : '';

            if (code && name && grade) {
              if (!semester && sem) semester = sem;
              subjects.push({ sem, code, name, type, credits, grade, revalGrade, result });
            }
          }
        });
      }
    });

    // SGPA line — "SEM:3, GPA : 8.17"
    $('*').each((i, el) => {
      const txt = $(el).text().trim();
      if (txt.match(/SEM\s*:\s*\d.*GPA\s*:\s*[\d.]+/i)) {
        const gpaMatch = txt.match(/GPA\s*:\s*([\d.]+)/i);
        const semMatch = txt.match(/SEM\s*:\s*(\d+)/i);
        if (gpaMatch) sgpa     = gpaMatch[1];
        if (semMatch) semester = semMatch[1];
      }
    });

    // ── Build summary grade for blockchain ─────────────────
    // Use GPA as the "grade" stored on chain, plus a human-readable label
    let gradeLabel = '';
    const gpaNum = parseFloat(sgpa);
    if (!isNaN(gpaNum)) {
      if (gpaNum >= 9.0)      gradeLabel = `O (GPA: ${sgpa})`;
      else if (gpaNum >= 8.0) gradeLabel = `A+ (GPA: ${sgpa})`;
      else if (gpaNum >= 7.0) gradeLabel = `A (GPA: ${sgpa})`;
      else if (gpaNum >= 6.0) gradeLabel = `B+ (GPA: ${sgpa})`;
      else if (gpaNum >= 5.5) gradeLabel = `B (GPA: ${sgpa})`;
      else                    gradeLabel = `Pass (GPA: ${sgpa})`;
    } else {
      gradeLabel = subjects.length > 0 ? subjects[0].grade : 'Pass';
    }

    // ── Return structured result ────────────────────────────
    return res.json({
      success:     true,
      prn:         parsedPRN || prn,
      studentName,
      degreeBranch,
      examTitle:   examTitle || `Semester ${semester} Result`,
      semester,
      sgpa,
      gradeLabel,  // this goes on chain
      subjects,    // full breakdown shown in UI
    });

  } catch (err) {
    console.error('Fetch error:', err.message);

    if (err.code === 'ECONNREFUSED' || err.code === 'ENOTFOUND') {
      return res.status(502).json({ success: false, error: 'Could not reach the university server. Try again in a moment.' });
    }
    if (err.response?.status === 403 || err.response?.status === 429) {
      return res.status(429).json({ success: false, error: 'University server is rate limiting requests. Please wait 30 seconds and try again.' });
    }
    return res.status(500).json({ success: false, error: 'Server error: ' + err.message });
  }
});

app.listen(PORT, () => {
  console.log(`CredChain backend running on port ${PORT}`);
});
