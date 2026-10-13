const express = require('express');
const cors = require('cors');
const { spawn } = require('child_process');
const path = require('path');

const app = express();
const PORT = 5001;

app.use(cors());
app.use(express.json());

app.get('/api/report/:runId', (req, res) => {
    const { runId } = req.params;
    const projectDir = path.resolve(__dirname, '..');

    const args = [
        '-m',
        'src.app',
        '--source',
        'live',
        'ask',
        `Why did run ${runId} fail?`
    ];

    const pyProcess = spawn('python3', args, {
        cwd: projectDir,
        env: {
            ...process.env,
            PYTHONPATH: '.',
            PYTHONUNBUFFERED: '1',
            HF_HUB_DISABLE_SYMLINKS_WARNING: '1',
        },
    });

    let fullOutput = '';
    let errorOutput = '';

    pyProcess.stdout.on('data', (data) => {
        fullOutput += data.toString();
    });

    pyProcess.stderr.on('data', (data) => {
        errorOutput += data.toString();
    });

    pyProcess.on('close', (code) => {
        // If stdout has content, return stdout; otherwise fallback to stderr
        const result = fullOutput.trim() ? fullOutput : errorOutput;
        res.json({ report: result });
    });

    pyProcess.on('error', (err) => {
        console.error('Process Error:', err);
        res.status(500).json({ error: err.message });
    });
});

app.listen(PORT, () => {
    console.log(`Backend server listening on http://localhost:${PORT}`);
});