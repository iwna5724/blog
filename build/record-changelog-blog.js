/**
 * blog 카테고리 changelog 기록 스크립트
 * post-commit 훅에서 호출됨
 *
 * pre-commit 훅이 .git/CHANGELOG_BLOG_PENDING 플래그를 남긴 경우에만 실행.
 * 커밋 메시지를 읽어 blog 항목으로 changelog_data.json에 기록한 뒤,
 * git commit --amend --no-edit으로 현재 커밋에 포함시킨다.
 *
 * commitHash는 amend로 인해 변경되므로 여기서는 기록하지 않는다.
 * 최종 commitHash는 GitHub Actions (deploy.yml)에서 push 후에 채워넣는다.
 */

'use strict';

const fs = require('fs-extra');
const path = require('path');
const { execSync } = require('child_process');

const ROOT = path.join(__dirname, '..');
const CHANGELOG_PATH = path.join(ROOT, 'changelog', 'changelog_data.json');
const FLAG_PATH = path.join(ROOT, '.git', 'CHANGELOG_BLOG_PENDING');

async function main() {
  // 플래그 없으면 blog 변경 없음 → 종료
  if (!await fs.pathExists(FLAG_PATH)) {
    process.exit(0);
  }

  // 플래그 삭제
  await fs.remove(FLAG_PATH);

  // 커밋 메시지 읽기 (post-commit이므로 커밋이 이미 완료됨)
  let title = '';
  try {
    title = execSync('git log -1 --format=%s', {
      cwd: ROOT, encoding: 'utf-8', timeout: 5000
    }).trim();
  } catch (e) {
    console.warn('⚠️  커밋 정보 읽기 실패:', e.message);
    process.exit(0);
  }

  if (!title) process.exit(0);

  const today = new Date().toISOString().split('T')[0];

  // changelog_data.json 로드
  await fs.ensureDir(path.join(ROOT, 'changelog'));
  let changelogData = { entries: [] };
  try {
    if (await fs.pathExists(CHANGELOG_PATH)) {
      changelogData = JSON.parse(await fs.readFile(CHANGELOG_PATH, 'utf-8'));
    }
  } catch (e) {
    console.log('⚠️  changelog_data.json 로드 실패, 새로 생성');
  }

  // 중복 체크
  const isDuplicate = changelogData.entries.some(e =>
    e.date === today &&
    e.category === 'blog' &&
    (typeof e.description === 'object' ? e.description.ko : e.description) === title
  );

  if (isDuplicate) process.exit(0);

  // 항목 추가 (commitHash는 Actions에서 채워넣음)
  changelogData.entries.push({
    id: Date.now(),
    date: today,
    category: 'blog',
    description: { ko: title, ja: '' },
  });

  // 날짜 오름차순 정렬
  changelogData.entries.sort((a, b) => {
    const dateCmp = a.date.localeCompare(b.date);
    return dateCmp !== 0 ? dateCmp : a.id - b.id;
  });

  await fs.writeFile(CHANGELOG_PATH, JSON.stringify(changelogData, null, 2));
  console.log(`📋 blog 변경사항 기록: ${title}`);

  // changelog_data.json을 현재 커밋에 포함 (amend)
  try {
    execSync('git add changelog/changelog_data.json', { cwd: ROOT, stdio: 'inherit' });
    execSync('git commit --amend --no-edit --no-verify', { cwd: ROOT, stdio: 'inherit' });
    console.log('   → changelog_data.json amend 완료');
  } catch (e) {
    console.warn('⚠️  amend 실패:', e.message);
  }
}

main().catch(e => {
  console.error('❌ record-changelog-blog 실패:', e.message);
  process.exit(0);
});
