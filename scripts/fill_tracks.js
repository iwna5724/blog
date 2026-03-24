const fs = require('fs');
const path = require('path');
const https = require('https');

// 인증 정보는 scripts/.env 파일에 저장 (커밋 금지)
// SPOTIFY_CLIENT_ID=...
// SPOTIFY_CLIENT_SECRET=...
const envPath = path.join(__dirname, '.env');
if (fs.existsSync(envPath)) {
  fs.readFileSync(envPath, 'utf8').split('\n').forEach(line => {
    const [key, val] = line.split('=');
    if (key && val) process.env[key.trim()] = val.trim();
  });
}
const CLIENT_ID = process.env.SPOTIFY_CLIENT_ID;
const CLIENT_SECRET = process.env.SPOTIFY_CLIENT_SECRET;
if (!CLIENT_ID || !CLIENT_SECRET) {
  console.error('scripts/.env 파일에 SPOTIFY_CLIENT_ID, SPOTIFY_CLIENT_SECRET을 설정해주세요.');
  process.exit(1);
}
const DATA_PATH = path.join(__dirname, '../album/album_data.json');

function httpsPost(url, headers, body) {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const options = {
      hostname: u.hostname,
      path: u.pathname + u.search,
      method: 'POST',
      headers: { ...headers, 'Content-Length': Buffer.byteLength(body) },
    };
    const req = https.request(options, res => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => resolve(JSON.parse(data)));
    });
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

function httpsGet(url, headers) {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const options = {
      hostname: u.hostname,
      path: u.pathname + u.search,
      method: 'GET',
      headers,
    };
    const req = https.request(options, res => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => resolve(JSON.parse(data)));
    });
    req.on('error', reject);
    req.end();
  });
}

async function getToken() {
  const creds = Buffer.from(`${CLIENT_ID}:${CLIENT_SECRET}`).toString('base64');
  const res = await httpsPost(
    'https://accounts.spotify.com/api/token',
    { 'Content-Type': 'application/x-www-form-urlencoded', 'Authorization': `Basic ${creds}` },
    'grant_type=client_credentials'
  );
  return res.access_token;
}

function msToTime(ms) {
  const mins = Math.floor(ms / 60000);
  const secs = Math.floor((ms % 60000) / 1000);
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

async function fetchTracks(albumId, token) {
  const res = await httpsGet(
    `https://api.spotify.com/v1/albums/${albumId}/tracks?limit=50`,
    { 'Authorization': `Bearer ${token}` }
  );
  if (!res.items) return null;
  return res.items.map(t => ({
    title: t.name,
    duration: msToTime(t.duration_ms),
    excluded: false,
  }));
}

async function main() {
  const raw = fs.readFileSync(DATA_PATH, 'utf8');
  const data = JSON.parse(raw);

  const targets = data.cells.filter(c =>
    c.id >= 76 &&
    c.spotifyLink &&
    c.tracks &&
    c.tracks.length > 0 &&
    c.tracks[0].title === ''
  );

  const noId = targets.filter(c => !c.spotifyLink.match(/album\/([A-Za-z0-9]+)/));
  const valid = targets.filter(c => c.spotifyLink.match(/album\/([A-Za-z0-9]+)/));

  console.log(`처리 대상: ${valid.length}개 / 스킵(Spotify ID 없음): ${noId.map(c => c.id).join(', ')}`);

  let token = await getToken();
  let tokenTime = Date.now();

  let success = 0, fail = 0;

  for (const cell of valid) {
    // 토큰 만료 전 갱신 (50분 경과 시)
    if (Date.now() - tokenTime > 50 * 60 * 1000) {
      token = await getToken();
      tokenTime = Date.now();
      console.log('토큰 갱신됨');
    }

    const match = cell.spotifyLink.match(/album\/([A-Za-z0-9]+)/);
    const albumId = match[1];

    try {
      const tracks = await fetchTracks(albumId, token);
      if (!tracks || tracks.length === 0) {
        console.log(`[SKIP] ID ${cell.id} ${cell.artist} - ${cell.album}: 트랙 없음`);
        fail++;
        continue;
      }
      cell.tracks = tracks;
      console.log(`[OK] ID ${cell.id} ${cell.artist} - ${cell.album}: ${tracks.length}곡`);
      success++;
    } catch (e) {
      console.log(`[FAIL] ID ${cell.id} ${cell.artist} - ${cell.album}: ${e.message}`);
      fail++;
    }

    // API 레이트 리밋 방지
    await new Promise(r => setTimeout(r, 100));
  }

  fs.writeFileSync(DATA_PATH, JSON.stringify(data, null, 2), 'utf8');
  console.log(`\n완료: 성공 ${success}개, 실패/스킵 ${fail}개`);
}

main().catch(console.error);
