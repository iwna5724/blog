/**
 * 블로그 빌드 스크립트 (증분 빌드 지원)
 * content/ 폴더의 마크다운 파일들을 읽어서 public/ 폴더에 HTML 생성
 *
 * 사용법:
 *   node build/build.js         - 증분 빌드 (변경된 파일만)
 *   node build/build.js --full  - 전체 빌드
 */

const fs = require('fs-extra');
const path = require('path');
const crypto = require('crypto');
const { execSync } = require('child_process');
const { marked } = require('marked');
const matter = require('gray-matter');

// 설정 로드
const config = require('../config.json');

// 경로 설정
const PATHS = {
  content: path.join(__dirname, '..', config.paths.content),
  templates: path.join(__dirname, '..', config.paths.templates),
  static: path.join(__dirname, '..', config.paths.static),
  output: path.join(__dirname, '..', config.paths.output),
  cache: path.join(__dirname, '..', '.build-cache.json')
};

// 커맨드라인 옵션
const args = process.argv.slice(2);
const FULL_BUILD = args.includes('--full') || args.includes('-f');

/**
 * 파일 해시 생성
 */
function getFileHash(filepath) {
  try {
    const content = fs.readFileSync(filepath);
    return crypto.createHash('md5').update(content).digest('hex');
  } catch (e) {
    return null;
  }
}

/**
 * 캐시 로드
 */
function loadCache() {
  try {
    if (fs.existsSync(PATHS.cache)) {
      return JSON.parse(fs.readFileSync(PATHS.cache, 'utf-8'));
    }
  } catch (e) {
    console.log('⚠️  캐시 로드 실패, 전체 빌드 진행');
  }
  return { posts: {}, templates: {}, static: {}, config: null };
}

/**
 * 캐시 저장
 */
function saveCache(cache) {
  try {
    fs.writeFileSync(PATHS.cache, JSON.stringify(cache, null, 2));
  } catch (e) {
    console.log('⚠️  캐시 저장 실패');
  }
}

/**
 * 템플릿 변경 확인 (변경된 템플릿 목록 반환)
 */
async function checkTemplateChanges(cache) {
  const templatesDir = PATHS.templates;
  if (!await fs.pathExists(templatesDir)) return { changed: [], needFullBuild: false };

  const files = await fs.readdir(templatesDir);
  const changedTemplates = [];

  for (const file of files) {
    if (!file.endsWith('.html')) continue;
    const filepath = path.join(templatesDir, file);
    const hash = getFileHash(filepath);
    if (!cache.templates[file] || cache.templates[file] !== hash) {
      changedTemplates.push(file);
    }
  }

  // 전체 빌드가 필요한 템플릿 (index.html, post.html, tag.html, lists.html)
  const fullBuildTemplates = ['index.html', 'post.html', 'tag.html', 'lists.html'];
  const needFullBuild = changedTemplates.some(t => fullBuildTemplates.includes(t));

  return { changed: changedTemplates, needFullBuild };
}

/**
 * 템플릿 해시 업데이트
 */
async function updateTemplateHashes(cache) {
  const templatesDir = PATHS.templates;
  if (!await fs.pathExists(templatesDir)) return;

  const files = await fs.readdir(templatesDir);
  cache.templates = {};
  for (const file of files) {
    if (!file.endsWith('.html')) continue;
    const filepath = path.join(templatesDir, file);
    cache.templates[file] = getFileHash(filepath);
  }
}

/**
 * config.json 변경 확인
 */
function checkConfigChange(cache) {
  const configPath = path.join(__dirname, '..', 'config.json');
  const hash = getFileHash(configPath);
  return cache.config !== hash;
}

// 빌드 메인 함수
async function build() {
  const startTime = Date.now();
  console.log('🚀 블로그 빌드 시작...\n');

  // 캐시 로드
  let cache = loadCache();
  let needFullBuild = FULL_BUILD;
  let changedTemplates = [];

  // 전체 빌드가 필요한지 확인
  if (!needFullBuild) {
    // 템플릿 변경 확인
    const templateCheck = await checkTemplateChanges(cache);
    changedTemplates = templateCheck.changed;

    if (changedTemplates.length > 0) {
      console.log(`📝 템플릿 변경 감지: ${changedTemplates.join(', ')}`);
      if (templateCheck.needFullBuild) {
        console.log('   → 포스트 관련 템플릿 변경 → 전체 빌드 진행');
        needFullBuild = true;
      } else {
        console.log('   → 독립 페이지 템플릿만 변경 → 해당 페이지만 빌드');
      }
    }

    // config.json 변경 확인
    if (checkConfigChange(cache)) {
      console.log('⚙️  config.json 변경 감지 → 전체 빌드 진행');
      needFullBuild = true;
    }
    // output 폴더가 없으면 전체 빌드
    if (!await fs.pathExists(PATHS.output)) {
      console.log('📁 output 폴더 없음 → 전체 빌드 진행');
      needFullBuild = true;
    }
  }

  if (FULL_BUILD) {
    console.log('🔄 전체 빌드 모드 (--full)\n');
  } else if (needFullBuild) {
    console.log('🔄 전체 빌드 모드\n');
  } else if (changedTemplates.length > 0) {
    console.log('⚡ 부분 빌드 모드 (템플릿 변경)\n');
  } else {
    console.log('⚡ 증분 빌드 모드\n');
  }

  try {
    // 1. output 폴더 준비
    if (needFullBuild) {
      console.log('📁 출력 폴더 준비 중...');
      try {
        await fs.emptyDir(PATHS.output);
      } catch (e) {
        console.log('   ⚠️ emptyDir 실패, 개별 삭제 시도 중...');
        if (await fs.pathExists(PATHS.output)) {
          const items = await fs.readdir(PATHS.output).catch(() => []);
          for (const item of items) {
            try {
              await fs.remove(path.join(PATHS.output, item));
            } catch (err) {
              console.log(`   ⚠️ 삭제 실패 (덮어쓰기 진행): ${item}`);
            }
          }
        }
      }
    }
    await fs.ensureDir(PATHS.output);

    // 2. 정적 파일 복사 (변경된 경우만)
    await copyStaticFiles(cache, needFullBuild);

    // 3. content 폴더 확인
    if (!await fs.pathExists(PATHS.content)) {
      console.log('⚠️  content 폴더가 없습니다. 생성합니다...');
      await fs.ensureDir(PATHS.content);
      console.log('ℹ️  content 폴더에 마크다운 파일을 추가해주세요.');
      return;
    }

    // 4. 모든 마크다운 파일 읽기 및 변경 감지
    console.log('📖 마크다운 파일 분석 중...');
    const { posts, changedPosts, deletedPosts, unchanged } = await loadAllPostsWithCache(cache, needFullBuild);

    console.log(`   → 총 ${posts.length}개의 글`);
    if (!needFullBuild) {
      console.log(`   → 변경: ${changedPosts.length}개, 삭제: ${deletedPosts.length}개, 유지: ${unchanged}개\n`);
    }

    if (posts.length === 0) {
      console.log('ℹ️  작성된 글이 없습니다.');
      await createEmptyIndexPage();
      saveCache(cache);
      return;
    }

    // 5. 변경된 포스트만 HTML로 변환
    if (changedPosts.length > 0 || needFullBuild) {
      console.log('🔨 개별 글 페이지 생성 중...');
      const postsToGenerate = needFullBuild ? posts : changedPosts;
      for (const post of postsToGenerate) {
        await generatePostPage(post);
        console.log(`   ✓ ${post.slug}`);
      }
    }

    // 6. 삭제된 포스트 처리
    if (deletedPosts.length > 0) {
      console.log('🗑️  삭제된 글 정리 중...');
      for (const slug of deletedPosts) {
        const postDir = path.join(PATHS.output, 'posts', slug);
        if (await fs.pathExists(postDir)) {
          await fs.remove(postDir);
          console.log(`   ✓ ${slug} 삭제`);
        }
        delete cache.posts[slug + '.md'];
      }
    }

    // 7. 변경사항 자동 기록
    await recordChangelog(cache, changedPosts, deletedPosts, posts, needFullBuild);

    // 8. 인덱스/태그 페이지는 변경이 있을 때만 재생성
    if (changedPosts.length > 0 || deletedPosts.length > 0 || needFullBuild) {
      console.log('\n📝 메인 페이지 생성 중...');
      await generateIndexPage(posts);

      console.log('🏷️  태그 페이지 생성 중...');
      await generateTagPages(posts);
      await generateAllTagsPage(posts);

      console.log('📡 RSS 피드 생성 중...');
      await generateRSSFeed(posts);

      if (config.features && config.features.search) {
        console.log('🔍 검색 인덱스 생성 중...');
        await generateSearchIndex(posts);
      }

      console.log('🎵 음악 페이지 생성 중...');
      await generateMusicPage();

      console.log('📷 사진 페이지 생성 중...');
      await generatePhotoPage();

      console.log('📋 변경사항 페이지 생성 중...');
      await generateChangelogPage();
    } else if (changedTemplates.length > 0) {
      // 독립 페이지 템플릿만 변경된 경우 해당 페이지만 빌드
      console.log('\n📄 변경된 독립 페이지만 빌드 중...');

      if (changedTemplates.includes('music.html')) {
        console.log('🎵 음악 페이지 생성 중...');
        await generateMusicPage();
      }

      if (changedTemplates.includes('photo.html')) {
        console.log('📷 사진 페이지 생성 중...');
        await generatePhotoPage();
      }

      if (changedTemplates.includes('changelog.html')) {
        console.log('📋 변경사항 페이지 생성 중...');
        await generateChangelogPage();
      }
    } else {
      console.log('\n✨ 변경 사항 없음 - 추가 빌드 생략');
    }

    // 9. 캐시 업데이트
    await updateTemplateHashes(cache);
    cache.config = getFileHash(path.join(__dirname, '..', 'config.json'));
    saveCache(cache);

    const elapsed = ((Date.now() - startTime) / 1000).toFixed(2);
    console.log(`\n✅ 빌드 완료! (${elapsed}초)`);
    console.log(`📂 출력 위치: ${PATHS.output}`);
    console.log(`📊 총 ${posts.length}개의 글\n`);

  } catch (error) {
    console.error('❌ 빌드 실패:', error);
    process.exit(1);
  }
}

/**
 * 정적 파일 복사 (스마트 복사)
 */
async function copyStaticFiles(cache, needFullBuild) {
  // static 폴더 복사
  console.log('📋 정적 파일 복사 중...');
  if (await fs.pathExists(PATHS.static)) {
    if (needFullBuild) {
      await fs.copy(PATHS.static, path.join(PATHS.output, 'static'));
    } else {
      await smartCopy(PATHS.static, path.join(PATHS.output, 'static'));
    }
    console.log('   → static 폴더 복사 완료');
  }

  // admin 폴더 복사
  console.log('⚙️  관리자 페이지 복사 중...');
  const adminPath = path.join(__dirname, '..', 'admin');
  if (await fs.pathExists(adminPath)) {
    if (needFullBuild) {
      await fs.copy(adminPath, path.join(PATHS.output, 'admin'));
    } else {
      await smartCopy(adminPath, path.join(PATHS.output, 'admin'));
    }
    console.log('   → admin 폴더 복사 완료');
  }

  // config.json 복사
  console.log('⚙️  config.json 복사 중...');
  const configPath = path.join(__dirname, '..', 'config.json');
  if (await fs.pathExists(configPath)) {
    await fs.copy(configPath, path.join(PATHS.output, 'config.json'));
    console.log('   → config.json 복사 완료');
  }

  // album 폴더 복사
  console.log('🎵 앨범 데이터 복사 중...');
  const albumPath = path.join(__dirname, '..', 'album');
  if (await fs.pathExists(albumPath)) {
    if (needFullBuild) {
      await fs.copy(albumPath, path.join(PATHS.output, 'album'));
    } else {
      await smartCopy(albumPath, path.join(PATHS.output, 'album'));
    }
    console.log('   → album 폴더 복사 완료');
  }

  // photo 폴더 복사
  console.log('📷 사진 데이터 복사 중...');
  const photoPath = path.join(__dirname, '..', 'photo');
  if (await fs.pathExists(photoPath)) {
    if (needFullBuild) {
      await fs.copy(photoPath, path.join(PATHS.output, 'photo'));
    } else {
      await smartCopy(photoPath, path.join(PATHS.output, 'photo'));
    }
    console.log('   → photo 폴더 복사 완료');
  }

  // changelog 폴더 복사
  console.log('📋 변경사항 데이터 복사 중...');
  const changelogPath = path.join(__dirname, '..', 'changelog');
  if (await fs.pathExists(changelogPath)) {
    if (needFullBuild) {
      await fs.copy(changelogPath, path.join(PATHS.output, 'changelog'));
    } else {
      await smartCopy(changelogPath, path.join(PATHS.output, 'changelog'));
    }
    console.log('   → changelog 폴더 복사 완료');
  }

  // PWA 파일 복사
  console.log('📱 PWA 파일 복사 중...');
  const manifestPath = path.join(PATHS.static, 'manifest.json');
  const swPath = path.join(PATHS.static, 'sw.js');
  if (await fs.pathExists(manifestPath)) {
    await fs.copy(manifestPath, path.join(PATHS.output, 'manifest.json'));
    console.log('   → manifest.json 복사 완료');
  }
  if (await fs.pathExists(swPath)) {
    await fs.copy(swPath, path.join(PATHS.output, 'sw.js'));
    console.log('   → sw.js 복사 완료');
  }
}

/**
 * 스마트 복사 (변경된 파일만)
 */
async function smartCopy(src, dest) {
  await fs.ensureDir(dest);

  const items = await fs.readdir(src);
  for (const item of items) {
    const srcPath = path.join(src, item);
    const destPath = path.join(dest, item);
    const stat = await fs.stat(srcPath);

    if (stat.isDirectory()) {
      await smartCopy(srcPath, destPath);
    } else {
      // 대상 파일이 없거나 수정 시간이 다르면 복사
      const destExists = await fs.pathExists(destPath);
      if (!destExists) {
        await fs.copy(srcPath, destPath);
      } else {
        const destStat = await fs.stat(destPath);
        if (stat.mtimeMs > destStat.mtimeMs) {
          await fs.copy(srcPath, destPath);
        }
      }
    }
  }
}

/**
 * 모든 포스트 로드 (캐시 활용)
 */
async function loadAllPostsWithCache(cache, needFullBuild) {
  const files = await fs.readdir(PATHS.content);
  const mdFiles = files.filter(file => file.endsWith('.md'));

  const changedPosts = [];
  const allPosts = [];
  let unchangedCount = 0;

  // 삭제된 파일 감지
  const currentFiles = new Set(mdFiles);
  const deletedPosts = Object.keys(cache.posts)
    .filter(filename => !currentFiles.has(filename))
    .map(filename => filename.replace(/\.md$/, ''));

  for (const filename of mdFiles) {
    const filepath = path.join(PATHS.content, filename);
    const hash = getFileHash(filepath);
    const isChanged = !cache.posts[filename] || cache.posts[filename] !== hash;

    // 포스트 로드
    const post = await loadPost(filepath, filename);
    allPosts.push(post);

    if (isChanged || needFullBuild) {
      changedPosts.push(post);
      cache.posts[filename] = hash;
    } else {
      unchangedCount++;
    }
  }

  // 날짜순 정렬 (최신순)
  allPosts.sort((a, b) => new Date(b.date) - new Date(a.date));
  changedPosts.sort((a, b) => new Date(b.date) - new Date(a.date));

  return {
    posts: allPosts,
    changedPosts,
    deletedPosts,
    unchanged: unchangedCount
  };
}

/**
 * 단일 포스트 로드
 */
async function loadPost(filepath, filename) {
  const fileContent = await fs.readFile(filepath, 'utf-8');

  // front matter 파싱
  const { data, content } = matter(fileContent);

  // 슬러그 생성 (URL용) - 파일명에서 .md만 제거
  const slug = filename.replace(/\.md$/, '');

  // 다국어 제목 추출 (객체면 ko 선택)
  const title = extractTitle(data.title, slug);

  // 각 언어별 제목 추출
  const titleKo = extractLanguageTitle(data.title, 'ko', title);
  const titleJa = extractLanguageTitle(data.title, 'ja', title);

  // 다국어 content에서 주석 제거 및 각 언어 섹션 추출
  const contentKo = extractContent(content, 'ko');
  const contentJa = extractContent(content, 'ja');

  // 기본 언어는 한국어
  const cleanContent = contentKo || contentJa || content;

  // HTML 변환 (정제된 content 사용, 들여쓰기 치환 적용)
  let htmlKo = marked(replaceIndentation(contentKo || content));
  let htmlJa = marked(replaceIndentation(contentJa || content));

  const html = htmlKo;  // 기본은 한국어

  // 발췌문 생성 (정제된 content 사용)
  const excerpt = generateExcerpt(cleanContent, config.build.excerptLength || 200);

  return {
    filename,
    slug,
    title,  // 기본 제목 (한국어 우선)
    titleKo,  // 한국어 제목
    titleJa,  // 일본어 제목
    date: data.date || '',
    tags: normalizeTags(data.tags),
    challenges: normalizeTags(data.challenges),
    music: data.music || null,  // 음악 정보
    author: data.author || config.blog.author,
    content: html,  // 기본 HTML (한국어 우선)
    contentKo: htmlKo,  // 한국어 HTML
    contentJa: htmlJa,  // 일본어 HTML
    rawContent: content,
    rawContentKo: contentKo,  // 한국어 원본
    rawContentJa: contentJa,  // 일본어 원본
    excerpt
  };
}

/**
 * 개별 포스트 페이지 생성
 */
async function generatePostPage(post) {
  const template = await loadTemplate('post.html');

  // 템플릿 변수 치환
  const html = template
    .replace(/\{\{title\}\}/g, escapeHtml(post.title))
    .replace(/\{\{titleKo\}\}/g, escapeHtml(post.titleKo || post.title))
    .replace(/\{\{titleJa\}\}/g, escapeHtml(post.titleJa || post.title))
    .replace(/\{\{date\}\}/g, post.date)
    .replace(/\{\{author\}\}/g, escapeHtml(post.author))
    .replace(/\{\{content\}\}/g, post.content)
    .replace(/\{\{contentKo\}\}/g, post.contentKo || post.content)
    .replace(/\{\{contentJa\}\}/g, post.contentJa || post.content)
    .replace(/\{\{tags\}\}/g, generateTagsHtml(post.tags))
    .replace(/\{\{challenges\}\}/g, generateChallengesHtml(post.challenges))
    .replace(/\{\{music\}\}/g, generateMusicHtml(post.music))
    .replace(/\{\{blogTitle\}\}/g, escapeHtml(config.blog.title))
    .replace(/\{\{blogUrl\}\}/g, config.blog.url)
    .replace(/\{\{description\}\}/g, escapeHtml(post.excerpt))
    .replace(/\{\{slug\}\}/g, post.slug);

  // 출력 경로
  const outputDir = path.join(PATHS.output, 'posts', post.slug);
  await fs.ensureDir(outputDir);
  await fs.writeFile(path.join(outputDir, 'index.html'), html);
}

/**
 * 메인 페이지 생성 (글 목록)
 */
async function generateIndexPage(posts) {
  const template = await loadTemplate('index.html');

  // 홈 페이지: ®️ 태그가 달린 글은 빌드 시점에 완전히 제외
  const HIDDEN_TAG = '®️';
  const visiblePosts = posts.filter(post => {
    const tags = Array.isArray(post.tags) ? post.tags.map(String) : [];
    return !tags.includes(HIDDEN_TAG);
  });

  // 홈 페이지 표시 개수
  const homePostsLimit = 4;

  // (翻訳未完了) 글은 일본어 모드에서만 숨겨야 하므로 빌드 시엔 제외할 수 없음.
  // 대신 충분한 후보를 HTML에 포함시키고, JS에서 숨김 처리 후 개수를 맞춤.
  // 후보 수 = homePostsLimit + (翻訳未完了) 글 수 (최대 전체), 여유롭게 2배 확보
  const candidatePool = visiblePosts.slice(0, homePostsLimit * 3);
  // 실제로 렌더링할 목록 — 후보 전체를 HTML에 포함 (JS가 잘라냄)
  const recentPosts = candidatePool;

  // 태그 수집
  const allTags = new Set();
  posts.forEach(post => {
    const tags = Array.isArray(post.tags) ? post.tags : [];
    tags.forEach(tag => allTags.add(String(tag))); // 문자열로 변환
  });

  // 빈 상태 HTML
  const emptyState = posts.length === 0 ? `
    <div class="empty-state">
      <div class="empty-icon">📝</div>
      <h3>아직 작성된 글이 없습니다</h3>
      <p>첫 번째 글을 작성해보세요!</p>
      <a href="./admin/login.html" class="btn-primary">✍️ 글 쓰러 가기</a>
    </div>
  ` : '';

  // 글 목록 HTML 생성 (카드 형태)
  const postsHtml = recentPosts.map(post => {
    // 일본어 타이틀이 (翻訳未完了)로 시작하면 마커 부여 → JS가 언어에 따라 숨김 처리
    const jaTitle = post.titleJa || post.title || '';
    const jaIncomplete = jaTitle.startsWith('(翻訳未完了)') ? ' data-ja-incomplete="1"' : '';
    return `
    <article class="post-card"${jaIncomplete}>
      <div class="post-card-content">
        <h2 class="post-card-title">
          <a href="./posts/${post.slug}/index.html"
             data-lang-ko="${escapeHtml(post.titleKo || post.title)}"
             data-lang-ja="${escapeHtml(post.titleJa || post.title)}">${escapeHtml(post.titleKo || post.title)}</a>
        </h2>
        <div class="post-meta">
          <time datetime="${post.date}" data-date="${post.date}">${formatDate(post.date)}</time>
          ${post.tags && post.tags.length > 0 ? `
            <span class="post-tags">
              ${post.tags.map(tag => {
                // 태그를 문자열로 변환하고 안전한 URL로 변경
                const safeTag = String(tag).replace(/[<>:"/\\|?*]/g, '-');
                return `<a href="./tags/${encodeURIComponent(safeTag)}/index.html" class="tag">${escapeHtml(String(tag))}</a>`;
              }).join(' ')}
            </span>
          ` : ''}
        </div>
        <p class="post-excerpt"
          data-lang-ko="${escapeHtml(post.rawContentKo || post.excerpt)}"
          data-lang-ja="${escapeHtml(post.rawContentJa || post.excerpt)}">
          ${escapeHtml(post.rawContentKo || post.excerpt)}
        </p>
        <a href="./posts/${post.slug}/index.html" class="read-more" data-i18n="readMore">더 읽기 →</a>
      </div>
    </article>
  `;
  }).join('\n');

  // 태그 클라우드 HTML 생성
  const tagsSection = allTags.size > 0 ? `
    <section class="tags-cloud-section">
      <div class="section-header">
        <h2 class="section-title">태그</h2>
        <a href="./tags/" class="see-all">전체 보기 →</a>
      </div>
      <div class="tags-cloud">
        ${Array.from(allTags).slice(0, 20).map(tag => {
          const safeTag = String(tag).replace(/[<>:"/\\|?*]/g, '-');
          return `<a href="./tags/${encodeURIComponent(safeTag)}/index.html" class="tag-cloud-item">${escapeHtml(String(tag))}</a>`;
        }).join('\n        ')}
      </div>
    </section>
  ` : '';

  // 최근 음악 섹션 HTML 생성 (앨범 데이터 최근 4개)
  let recentMusicSection = '';
  try {
    const albumDataPath = path.join(__dirname, '..', 'album', 'album_data.json');
    if (await fs.pathExists(albumDataPath)) {
      const albumData = JSON.parse(await fs.readFile(albumDataPath, 'utf-8'));
      const cells = Array.isArray(albumData.cells) ? albumData.cells : [];
      // updatedAt 기준 내림차순 → 최근 업데이트된 4개
      // updatedAt 없는 기존 셀은 id를 fallback으로 사용
      const recentAlbums = [...cells]
        .sort((a, b) => (b.updatedAt || b.id || 0) - (a.updatedAt || a.id || 0))
        .slice(0, 4);
      if (recentAlbums.length > 0) {
        const albumsHtml = recentAlbums.map(cell => {
          const imgSrc = cell.imgPath ? `./${cell.imgPath}` : '';
          const artistHtml = escapeHtml(cell.artist || '');
          const albumHtml  = escapeHtml(cell.album  || '');
          // 별점: rating 1~5 → ★ 채움 / ☆ 빔
          const rating = parseInt(cell.rating) || 0;
          const starsHtml = '★'.repeat(rating) + '☆'.repeat(Math.max(0, 5 - rating));
          return `<a href="./music.html?open=${cell.id}" class="home-music-item">
            <div class="home-music-cover">
              ${imgSrc
                ? `<img src="${imgSrc}" alt="${albumHtml}" loading="lazy">`
                : `<div class="home-music-cover-placeholder">🎵</div>`}
            </div>
            <div class="home-music-info">
              <span class="home-music-album">${albumHtml}</span>
              <span class="home-music-artist">${artistHtml}</span>
              <span class="home-music-rating">${starsHtml}</span>
            </div>
          </a>`;
        }).join('\n          ');
        recentMusicSection = `
      <section class="home-music-section">
        <div class="section-header">
          <h2 class="section-title" data-i18n="home.recentMusic">업데이트된 음악</h2>
          <a href="./music.html" class="section-more" data-i18n="home.more">더 보기 →</a>
        </div>
        <div class="home-music-grid">
          ${albumsHtml}
        </div>
      </section>`;
      }
    }
  } catch (e) {
    // 앨범 데이터 없으면 섹션 생략
  }

  // 최근 사진 섹션 HTML 생성
  let recentPhotosSection = '';
  try {
    const photoDataPath = path.join(__dirname, '..', 'photo', 'photo_data.json');
    if (await fs.pathExists(photoDataPath)) {
      const photoData = JSON.parse(await fs.readFile(photoDataPath, 'utf-8'));
      const photos = (Array.isArray(photoData) ? photoData : []).slice(-4).reverse();
      if (photos.length > 0) {
        const photosHtml = photos.map(p => {
          // thumbnail/url은 이미 'photo/...' 형태이므로 './' prefix만 붙임
          const thumb = (p.thumbnail || p.url || '').replace(/^\.\//, '');
          return `<a href="./photo.html?open=${p.id}" class="home-photo-item">
            <img src="./${thumb}" alt="photo" loading="lazy">
          </a>`;
        }).join('\n          ');
        recentPhotosSection = `
      <section class="home-photos-section">
        <div class="section-header">
          <h2 class="section-title" data-i18n="home.recentPhotos">최근 사진</h2>
          <a href="./photo.html" class="section-more" data-i18n="home.more">더 보기 →</a>
        </div>
        <div class="home-photos-grid">
          ${photosHtml}
        </div>
      </section>`;
      }
    }
  } catch (e) {
    // 사진 데이터 없으면 섹션 생략
  }

  // 최근 변경사항 섹션 HTML 생성
  let recentChangelogSection = '';
  try {
    const changelogPath = path.join(__dirname, '..', 'changelog', 'changelog_data.json');
    if (await fs.pathExists(changelogPath)) {
      const changelogData = JSON.parse(await fs.readFile(changelogPath, 'utf-8'));
      const catLabels = { blog: '블로그', diary: '일기', music: '음악', photo: '사진' };
      const entries = (changelogData.entries || [])
        .sort((a, b) => b.date.localeCompare(a.date) || b.id - a.id)
        .slice(0, 4);
      if (entries.length > 0) {
        const itemsHtml = entries.map(e => {
          const ko = typeof e.description === 'object' ? (e.description.ko || '') : (e.description || '');
          const ja = typeof e.description === 'object' ? (e.description.ja || ko) : (e.description || '');
          const cat = e.category || 'blog';
          const catLabel = catLabels[cat] || cat;
          const diaryLink = (cat === 'diary' && e.slug)
            ? `<a class="changelog-commit-link" href="./posts/${encodeURIComponent(e.slug)}.html" title="일기 보기">📄</a>`
            : '';
          return `<li class="home-changelog-item"
            data-desc-ko="${escapeHtml(ko)}"
            data-desc-ja="${escapeHtml(ja)}">
            <span class="home-changelog-date">${e.date}</span>
            <span class="home-changelog-cat cat-${cat}">${escapeHtml(catLabel)}</span>
            <span class="home-changelog-desc">${escapeHtml(ko)}</span>
            ${diaryLink}
          </li>`;
        }).join('\n          ');
        recentChangelogSection = `
      <section class="home-changelog-section">
        <div class="section-header">
          <h2 class="section-title" data-i18n="home.recentChanges">최근 변경사항</h2>
          <a href="./changelog.html" class="section-more" data-i18n="home.more">더 보기 →</a>
        </div>
        <ul class="home-changelog-list">
          ${itemsHtml}
        </ul>
      </section>`;
      }
    }
  } catch (e) {
    // changelog 데이터 없으면 섹션 생략
  }

  const html = template
    .replace(/\{\{blogTitle\}\}/g, escapeHtml(config.blog.title))
    .replace(/\{\{blogDescription\}\}/g, escapeHtml(config.blog.description))
    .replace(/\{\{posts\}\}/g, postsHtml)
    .replace(/\{\{totalPosts\}\}/g, posts.length)
    .replace(/\{\{totalTags\}\}/g, allTags.size)
    .replace(/\{\{emptyState\}\}/g, emptyState)
    .replace(/\{\{tagsSection\}\}/g, tagsSection)
    .replace(/\{\{recentMusicSection\}\}/g, recentMusicSection)
    .replace(/\{\{recentPhotosSection\}\}/g, recentPhotosSection)
    .replace(/\{\{recentChangelogSection\}\}/g, recentChangelogSection);

  await fs.writeFile(path.join(PATHS.output, 'index.html'), html);
}

/**
 * 태그 페이지 생성
 */
async function generateTagPages(posts) {
  // 모든 태그 수집
  const tagMap = new Map();

  posts.forEach(post => {
    // tags가 배열인지 확인 (안전장치)
    const tags = Array.isArray(post.tags) ? post.tags : [];

    tags.forEach(tag => {
      // 태그를 문자열로 변환 (숫자 태그 지원)
      const tagStr = String(tag);
      if (!tagMap.has(tagStr)) {
        tagMap.set(tagStr, []);
      }
      tagMap.get(tagStr).push(post);
    });
  });

  // 각 태그별 페이지 생성
  const template = await loadTemplate('tag.html');

  for (const [tag, tagPosts] of tagMap) {
    const postsHtml = tagPosts.map(post => `
      <article class="post-card">
        <div class="post-card-content">
          <h2 class="post-card-title">
            <a href="../../posts/${post.slug}/index.html"
              data-lang-ko="${escapeHtml(post.titleKo || post.title)}"
              data-lang-ja="${escapeHtml(post.titleJa || post.title)}">
              ${escapeHtml(post.titleKo || post.title)}
            </a>
          </h2>
          <div class="post-meta">
            <time datetime="${post.date}" data-date="${post.date}">${formatDate(post.date)}</time>
          </div>
          <p class="post-excerpt"
            data-lang-ko="${escapeHtml(post.rawContentKo || post.excerpt)}"
            data-lang-ja="${escapeHtml(post.rawContentJa || post.excerpt)}">
            ${escapeHtml(post.rawContentKo || post.excerpt)}
          </p>
          <a href="../../posts/${post.slug}/index.html" class="read-more" data-i18n="readMore">더 읽기 →</a>
        </div>
      </article>
    `).join('\n');

    const html = template
      .replace(/\{\{tag\}\}/g, escapeHtml(String(tag)))  // 문자열로 변환
      .replace(/\{\{blogTitle\}\}/g, escapeHtml(config.blog.title))
      .replace(/\{\{posts\}\}/g, postsHtml)
      .replace(/\{\{postCount\}\}/g, tagPosts.length);

    // 태그를 문자열로 변환하고 안전한 폴더명으로 변경
    const safeTag = String(tag).replace(/[<>:"/\\|?*]/g, '-');
    const outputDir = path.join(PATHS.output, 'tags', safeTag);
    await fs.ensureDir(outputDir);
    await fs.writeFile(path.join(outputDir, 'index.html'), html);
  }

  console.log(`   → ${tagMap.size}개의 태그 페이지 생성`);
}

/**
 * 전체 태그 목록 페이지 생성
 */
async function generateAllTagsPage(posts) {
  // 모든 태그 수집 및 카운트
  const typeTags = ['✏️', '📝', '⭐', '🦆', '®️'];

  const typeTagMap = new Map();

  posts.forEach(post => {
    const tags = Array.isArray(post.tags) ? post.tags : [];

    tags.forEach(tag => {
      const tagStr = String(tag);

      // 종류 태그 분류
      if (typeTags.includes(tagStr)) {
        if (!typeTagMap.has(tagStr)) {
          typeTagMap.set(tagStr, 0);
        }
        typeTagMap.set(tagStr, typeTagMap.get(tagStr) + 1);
      }
    });
  });

  // 날짜별 게시물 매핑 생성 (배열로 관리)
  const postsByDate = {};
  posts.forEach(post => {
    // date 또는 slug에서 YYYY-MM-DD 패턴 추출
    let dateStr = null;

    if (post.date) {
      // date 필드에서 YYYY-MM-DD 추출
      const match = String(post.date).match(/^\d{4}-\d{2}-\d{2}/);
      if (match) {
        dateStr = match[0];
      }
    }

    // date가 없으면 slug에서 추출
    if (!dateStr && post.slug) {
      const match = String(post.slug).match(/^\d{4}-\d{2}-\d{2}/);
      if (match) {
        dateStr = match[0];
      }
    }

    if (dateStr) {
      const tags = Array.isArray(post.tags) ? post.tags : [];

      // 종류 태그 찾기
      const typeTag = tags.find(tag => typeTags.includes(String(tag)));

      if (typeTag) {
        // 해당 날짜의 배열이 없으면 생성
        if (!postsByDate[dateStr]) {
          postsByDate[dateStr] = [];
        }

        // 배열에 추가
        postsByDate[dateStr].push({
          typeTag: String(typeTag),
          slug: post.slug,
          title: post.title,
          titleKo: post.titleKo || post.title,
          titleJa: post.titleJa || post.title
        });
      }
    }
  });

  // 종류 태그 정렬 (정의된 순서대로)
  const sortedTypeTags = typeTags
    .map(tag => [tag, typeTagMap.get(tag) || 0])
    .filter(([tag, count]) => count > 0);

  // 최대 글 개수 (프로그레스 바용)
  const maxTypeCount = sortedTypeTags.length > 0 ? Math.max(...sortedTypeTags.map(t => t[1])) : 1;

  // 전체 게시글 수 계산
  const totalPostCount = sortedTypeTags.reduce((sum, [, count]) => sum + count, 0);

  // 종류 태그 카드 HTML 생성
  const typeTagsGrid = sortedTypeTags.map(([tag, count]) => {
    const percentage = (count / maxTypeCount) * 100;
    const safeTag = String(tag).replace(/[<>:"/\\|?*]/g, '-');

    return `
      <a href="./tags/${encodeURIComponent(safeTag)}/index.html" class="tag-card">
        <div class="tag-card-header">
          <span class="tag-card-icon">${escapeHtml(String(tag))}</span>
        </div>
        <div class="tag-card-count">${count}<span class="tag-card-total">/${totalPostCount}</span></div>
        <div class="tag-card-bar">
          <div class="tag-card-bar-fill" style="width: ${percentage}%"></div>
        </div>
      </a>
    `;
  }).join('\n');

  const totalTagCount = typeTagMap.size;

  // 템플릿 로드 및 치환
  const template = await loadTemplate('lists.html');

  const html = template
    .replace(/\{\{blogTitle\}\}/g, escapeHtml(config.blog.title))
    .replace(/\{\{tagCount\}\}/g, totalTagCount)
    .replace(/\{\{typeTagsGrid\}\}/g, typeTagsGrid)
    .replace(/\{\{postsByDateJson\}\}/g, JSON.stringify(postsByDate));

  // lists.html 파일로 저장
  await fs.writeFile(path.join(PATHS.output, 'lists.html'), html);

  // 총 게시물 개수 계산
  const totalPosts = Object.values(postsByDate).reduce((sum, posts) => sum + posts.length, 0);
  console.log(`   → 전체 태그 목록 페이지 생성 (종류: ${typeTagMap.size}개, 날짜: ${Object.keys(postsByDate).length}일, 게시물: ${totalPosts}개)`);
}

/**
 * 검색 인덱스 생성 (JSON)
 */
async function generateSearchIndex(posts) {
  const searchIndex = posts.map(post => {
    const d = post.date ? new Date(post.date) : null;
    const dateStr = d && !isNaN(d)
      ? `${d.getFullYear()}/${String(d.getMonth() + 1).padStart(2, '0')}/${String(d.getDate()).padStart(2, '0')}`
      : '';
    return { titleKo: post.titleKo || post.title, titleJa: post.titleJa || post.title, slug: post.slug, date: dateStr };
  });

  await fs.writeFile(
    path.join(PATHS.output, 'search-index.json'),
    JSON.stringify(searchIndex, null, 2)
  );
}

/**
 * RSS 피드 생성
 */
async function generateRSSFeed(posts) {
  const recentPosts = posts.slice(0, 20);

  const items = recentPosts.map(post => `
    <item>
      <title>${escapeXml(post.title)}</title>
      <link>${config.blog.url}/posts/${post.slug}/</link>
      <guid>${config.blog.url}/posts/${post.slug}/</guid>
      <pubDate>${new Date(post.date).toUTCString()}</pubDate>
      <description>${escapeXml(post.excerpt)}</description>
    </item>
  `).join('\n');

  const rss = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
  <channel>
    <title>${escapeXml(config.blog.title)}</title>
    <link>${config.blog.url}</link>
    <description>${escapeXml(config.blog.description)}</description>
    <language>${config.blog.language || 'ko'}</language>
    ${items}
  </channel>
</rss>`;

  await fs.writeFile(path.join(PATHS.output, 'feed.xml'), rss);
}

/**
 * 빈 인덱스 페이지 생성 (글이 없을 때)
 */
async function createEmptyIndexPage() {
  const html = `
<!DOCTYPE html>
<html lang="ko">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeHtml(config.blog.title)}</title>
</head>
<body>
  <h1>${escapeHtml(config.blog.title)}</h1>
  <p>아직 작성된 글이 없습니다.</p>
</body>
</html>`;

  await fs.writeFile(path.join(PATHS.output, 'index.html'), html);
}

/**
 * 템플릿 로드
 */
async function loadTemplate(filename) {
  const templatePath = path.join(PATHS.templates, filename);

  if (!await fs.pathExists(templatePath)) {
    throw new Error(`템플릿을 찾을 수 없습니다: ${filename}`);
  }

  return await fs.readFile(templatePath, 'utf-8');
}

/**
 * 발췌문 생성
 */
function generateExcerpt(content, length = 200) {
  // 마크다운 문법 제거
  const plain = content
    .replace(/#{1,6}\s/g, '')
    .replace(/[*_`~]/g, '')
    .replace(/\[([^\]]+)\]\([^\)]+\)/g, '$1')
    .replace(/!\[([^\]]*)\]\([^\)]+\)/g, '')
    .trim();

  return plain.length > length
    ? plain.substring(0, length) + '...'
    : plain;
}

/**
 * 날짜 포맷팅
 */
function formatDate(dateString) {
  if (!dateString) return '';

  const date = new Date(dateString);
  return date.toLocaleDateString('ko-KR', {
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  });
}

/**
 * 다국어 제목 추출
 * 객체면 기본 언어(ko) 선택, 문자열이면 그대로 반환
 */
function extractTitle(title, fallback = 'Untitled') {
  if (!title) return fallback;

  // 이미 문자열이면 그대로 반환
  if (typeof title === 'string') {
    return title;
  }

  // 객체면 ko 또는 ja 또는 첫 번째 값 선택
  if (typeof title === 'object' && !Array.isArray(title)) {
    return title.ko || title.ja || Object.values(title)[0] || fallback;
  }

  // 배열이면 첫 번째 항목
  if (Array.isArray(title)) {
    return title[0] || fallback;
  }

  // 그 외는 문자열로 변환
  return String(title);
}

/**
 * 특정 언어의 제목 추출
 */
function extractLanguageTitle(title, lang, fallback = '') {
  if (!title) return fallback;

  // 이미 문자열이면 그대로 반환 (모든 언어에 동일)
  if (typeof title === 'string') {
    return title;
  }

  // 객체면 해당 언어 선택
  if (typeof title === 'object' && !Array.isArray(title)) {
    return title[lang] || fallback;
  }

  // 배열이면 첫 번째 항목
  if (Array.isArray(title)) {
    return title[0] || fallback;
  }

  // 그 외는 fallback
  return fallback;
}

/**
 * 다국어 content에서 특정 언어 섹션 추출
 * <!-- ko --> ... <!-- /ko --> 형태의 주석 제거
 */
function extractContent(content, lang = 'ko') {
  if (!content) return '';

  // 언어 섹션 패턴
  const langPattern = new RegExp(`<!--\\s*${lang}\\s*-->([\\s\\S]*?)<!--\\s*\\/${lang}\\s*-->`, 'i');
  const match = content.match(langPattern);

  if (match) {
    // 특정 언어 섹션이 있으면 해당 내용만 반환
    // 줄바꿈만 제거 (반각/전각 스페이스는 유지)
    return match[1].replace(/^\n+|\n+$/g, '');
  }

  // 언어 섹션이 없으면 모든 주석 제거
  return content
    .replace(/<!--\s*\w+\s*-->/gi, '')
    .replace(/<!--\s*\/\w+\s*-->/gi, '')
    .replace(/^\n+|\n+$/g, ''); // 줄바꿈만 제거
}

/**
 * 태그 HTML 생성
 */
function generateTagsHtml(tags) {
  // 이미 normalizeTags를 거쳤지만, 안전하게 한 번 더 체크
  const normalizedTags = normalizeTags(tags);

  if (normalizedTags.length === 0) return '';

  return normalizedTags
    .map(tag => `<span class="tag">${escapeHtml(tag)}</span>`)
    .join(' ');
}

/**
 * 도전 HTML 생성 (6개 모두 표시, 활성화/비활성화 구분)
 */
function generateChallengesHtml(challenges) {
  const allChallenges = ['🛌', '🚶', '📖', '🎸', '🏋️', '🎓'];
  const normalizedChallenges = normalizeTags(challenges);
  const activeChallenges = new Set(normalizedChallenges);

  return allChallenges
    .map(challenge => {
      const isActive = activeChallenges.has(challenge);
      const className = isActive ? 'challenge-badge active' : 'challenge-badge inactive';
      return `<span class="${className}">${escapeHtml(challenge)}</span>`;
    })
    .join(' ');
}

/**
 * 음악 HTML 생성 (729-739번 줄: 추가)
 */
/**
 * YouTube 링크에서 비디오 ID 추출
 */
function extractYouTubeId(url) {
  if (!url) return null;

  // 다양한 YouTube URL 형식 지원
  const patterns = [
    /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/|music\.youtube\.com\/watch\?v=)([a-zA-Z0-9_-]{11})/,
  ];

  for (const pattern of patterns) {
    const match = url.match(pattern);
    if (match && match[1]) {
      return match[1];
    }
  }

  return null;
}

/**
 * 음악 HTML 생성 (YouTube iframe 임베드, 클릭 시 표시)
 */
function generateMusicHtml(music) {
  if (!music || !music.title || !music.url) return '';

  const videoId = extractYouTubeId(music.url);

  if (videoId) {
    // YouTube 비디오면 링크 + 숨겨진 iframe
    return `<div class="post-music">
    <a href="javascript:void(0);" class="music-link" onclick="toggleYouTubePlayer(this, '${videoId}')">
      💽 ${escapeHtml(music.title)}
    </a>
    <div class="youtube-player-wrapper" id="youtube-wrapper-${videoId}" style="display: none;">
      <iframe
        width="480"
        height="200"
        src="https://www.youtube.com/embed/${videoId}"
        frameborder="0"
        allow="clipboard-write; encrypted-media; picture-in-picture"
        allowfullscreen>
      </iframe>
    </div>
  </div>`;
  } else {
    // YouTube가 아니면 외부 링크로 표시
    return `<div class="post-music">
    <a href="${escapeHtml(music.url)}" target="_blank" rel="noopener noreferrer" class="music-link">
      💽 ${escapeHtml(music.title)}
    </a>
  </div>`;
  }
}

/**
 * 태그를 배열로 정규화
 */
function normalizeTags(tags) {
  if (!tags) return [];

  // 이미 배열이면 문자열로 변환
  if (Array.isArray(tags)) {
    return tags
      .filter(tag => tag != null) // null/undefined 제거
      .map(tag => String(tag).trim()) // 숫자도 문자열로 변환
      .filter(tag => tag.length > 0);
  }

  // 문자열이면 파싱
  if (typeof tags === 'string') {
    // "[tag1, tag2]" 형태 처리
    if (tags.startsWith('[') && tags.endsWith(']')) {
      tags = tags.slice(1, -1);
    }

    // 콤마로 분리
    return tags
      .split(',')
      .map(t => t.trim())
      .filter(t => t.length > 0);
  }

  // 숫자 등 다른 타입이면 문자열로 변환
  if (typeof tags === 'number') {
    return [String(tags)];
  }

  // 그 외의 경우 빈 배열
  return [];
}

/**
 * 들여쓰기 치환 (반각 스페이스 → 전각 스페이스)
 */
function replaceIndentation(text) {
  if (!text) return text;

  // 줄 시작 부분의 스페이스를 전각 스페이스로 치환
  text = text.replace(/^[ ]+/gm, match => '　'.repeat(match.length));

  // 두 번 개행 후의 스페이스를 전각 스페이스로 치환
  text = text.replace(/\n\n[ ]+/g, match => {
    const spaceCount = match.length - 2; // \n\n 제외
    return '\n\n' + '　'.repeat(spaceCount);
  });

  return text;
}

/**
 * HTML 이스케이프
 */
function escapeHtml(text) {
  if (!text) return '';

  // 배열이면 문자열로 변환
  if (Array.isArray(text)) {
    return escapeHtml(text.join(', '));
  }

  // 문자열이 아니면 문자열로 변환
  if (typeof text !== 'string') {
    text = String(text);
  }

  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

/**
 * XML 이스케이프 (RSS용)
 */
function escapeXml(text) {
  if (!text) return '';

  // 배열이면 문자열로 변환
  if (Array.isArray(text)) {
    return escapeXml(text.join(', '));
  }

  // 문자열이 아니면 문자열로 변환
  if (typeof text !== 'string') {
    text = String(text);
  }

  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

/**
 * 변경사항 자동 기록
 */
async function recordChangelog(cache, changedPosts, deletedPosts, allPosts, isFullBuild) {
  const changelogPath = path.join(__dirname, '..', 'changelog', 'changelog_data.json');

  // changelog 폴더 확인
  await fs.ensureDir(path.join(__dirname, '..', 'changelog'));

  // 기존 데이터 로드
  let changelogData = { entries: [] };
  try {
    if (await fs.pathExists(changelogPath)) {
      changelogData = JSON.parse(await fs.readFile(changelogPath, 'utf-8'));
    }
  } catch (e) {
    console.log('   ⚠️ changelog_data.json 로드 실패, 새로 생성');
  }

  const today = new Date().toISOString().split('T')[0];
  let newEntries = 0;

  // 중복 체크 함수
  function isDuplicate(date, category, descKo) {
    return changelogData.entries.some(e =>
      e.date === date &&
      e.category === category &&
      (typeof e.description === 'object' ? e.description.ko : e.description) === descKo
    );
  }

  // 날짜를 YYYY-MM-DD 형식으로 변환
  function toDateString(d) {
    if (!d) return today;
    // 이미 YYYY-MM-DD 형식이면 그대로
    const str = String(d);
    const isoMatch = str.match(/^(\d{4}-\d{2}-\d{2})/);
    if (isoMatch) return isoMatch[1];
    // Date 객체 또는 파싱 가능한 문자열
    try {
      const dateObj = new Date(d);
      if (!isNaN(dateObj.getTime())) {
        return dateObj.toISOString().split('T')[0];
      }
    } catch (e) {}
    return today;
  }

  // 전체 빌드(--full) 시에는 일기 자동 기록 건너뛰기 (모든 포스트가 changed로 나오므로)
  if (!isFullBuild) {
    // 일기 변경 감지 (증분 빌드에서만)
    if (changedPosts && changedPosts.length > 0) {
      for (const post of changedPosts) {
        // 캐시에 해당 파일이 없으면 새 파일, 있으면 수정
        const isNew = !cache.posts || !cache.posts[post.filename];
        const titleKo = post.titleKo || post.title || post.slug;
        const titleJa = post.titleJa || post.title || post.slug;
        const date = toDateString(post.date);

        // 당일 일기는 기록하지 않음
        if (date === today) continue;

        const descKo = isNew ? `추가: ${titleKo}` : `수정: ${titleKo}`;
        const descJa = isNew ? `追加: ${titleJa}` : `修正: ${titleJa}`;

        if (!isDuplicate(date, 'diary', descKo)) {
          changelogData.entries.push({
            id: Date.now() + newEntries,
            date: date,
            category: 'diary',
            description: { ko: descKo, ja: descJa },

          });
          newEntries++;
        }
      }
    }

    // 일기 삭제 감지
    if (deletedPosts && deletedPosts.length > 0) {
      for (const slug of deletedPosts) {
        const descKo = `삭제: ${slug}`;
        const descJa = `削除: ${slug}`;

        if (!isDuplicate(today, 'diary', descKo)) {
          changelogData.entries.push({
            id: Date.now() + newEntries,
            date: today,
            category: 'diary',
            description: { ko: descKo, ja: descJa },

          });
          newEntries++;
        }
      }
    }

  } // end if (!isFullBuild)

  // 음악 데이터 상세 변경 감지 (항상 실행)
  const albumDataPath = path.join(__dirname, '..', 'album', 'album_data.json');
  if (await fs.pathExists(albumDataPath)) {
    const albumHash = getFileHash(albumDataPath);

    if (cache.albumDataHash && cache.albumDataHash !== albumHash) {
      // 해시 변경됨 → 상세 비교
      try {
        const albumData = JSON.parse(await fs.readFile(albumDataPath, 'utf-8'));
        const newCells = albumData.cells || [];
        const oldSummary = cache.albumSummary || [];

        const summaryFields = c => ({
          id: c.id, artist: c.artist, album: c.album,
          favTrack: c.favTrack, rating: c.rating,
          category: c.category, duration: c.duration, spotifyLink: c.spotifyLink
        });

        const oldMap = new Map(oldSummary.map(c => [c.id, c]));
        const newMap = new Map(newCells.map(c => [c.id, summaryFields(c)]));

        // 앨범 추가 감지
        for (const [id, cell] of newMap) {
          if (!oldMap.has(id)) {
            const descKo = `앨범 추가: ${cell.artist} - ${cell.album}`;
            const descJa = `アルバム追加: ${cell.artist} - ${cell.album}`;
            if (!isDuplicate(today, 'music', descKo)) {
              changelogData.entries.push({
                id: Date.now() + newEntries, date: today, category: 'music',
                description: { ko: descKo, ja: descJa }
              });
              newEntries++;
            }
          }
        }

        // 앨범 삭제 감지
        for (const [id, cell] of oldMap) {
          if (!newMap.has(id)) {
            const descKo = `앨범 삭제: ${cell.artist} - ${cell.album}`;
            const descJa = `アルバム削除: ${cell.artist} - ${cell.album}`;
            if (!isDuplicate(today, 'music', descKo)) {
              changelogData.entries.push({
                id: Date.now() + newEntries, date: today, category: 'music',
                description: { ko: descKo, ja: descJa }
              });
              newEntries++;
            }
          }
        }

        // 기존 앨범 변경 감지
        for (const [id, newCell] of newMap) {
          const oldCell = oldMap.get(id);
          if (!oldCell) continue;

          const changesKo = [];
          const changesJa = [];

          if (oldCell.favTrack !== newCell.favTrack) {
            changesKo.push(`최애곡 (${oldCell.favTrack || '없음'} → ${newCell.favTrack || '없음'})`);
            changesJa.push(`一番好きなトラック (${oldCell.favTrack || 'なし'} → ${newCell.favTrack || 'なし'})`);
          }
          if (oldCell.rating !== newCell.rating) {
            changesKo.push(`선호도 (${oldCell.rating} → ${newCell.rating})`);
            changesJa.push(`選好度 (${oldCell.rating} → ${newCell.rating})`);
          }
          if (oldCell.category !== newCell.category) {
            changesKo.push(`유형 (${oldCell.category || '없음'} → ${newCell.category || '없음'})`);
            changesJa.push(`タイプ (${oldCell.category || 'なし'} → ${newCell.category || 'なし'})`);
          }

          if (changesKo.length > 0) {
            const label = newCell.artist + ' · ' + newCell.album;
            const descKo = `앨범 수정: ${label} — ${changesKo.join(', ')}`;
            const descJa = `アルバム修正: ${label} — ${changesJa.join(', ')}`;
            if (!isDuplicate(today, 'music', descKo)) {
              changelogData.entries.push({
                id: Date.now() + newEntries, date: today, category: 'music',
                description: { ko: descKo, ja: descJa }
              });
              newEntries++;
            }
          }
        }

        // summary 업데이트
        cache.albumSummary = Array.from(newMap.values());

      } catch (e) {
        console.log('   ⚠️ 음악 데이터 비교 실패:', e.message);
      }
    } else if (!cache.albumSummary) {
      // 최초 실행: summary만 저장 (기존 앨범을 전부 "추가"로 기록하지 않음)
      try {
        const albumData = JSON.parse(await fs.readFile(albumDataPath, 'utf-8'));
        cache.albumSummary = (albumData.cells || []).map(c => ({
          id: c.id, artist: c.artist, album: c.album,
          favTrack: c.favTrack, rating: c.rating,
          category: c.category, duration: c.duration, spotifyLink: c.spotifyLink
        }));
      } catch (e) { /* ignore */ }
    }

    cache.albumDataHash = albumHash;
  }

  // 사진 데이터 상세 변경 감지 (항상 실행)
  const photoDataPath = path.join(__dirname, '..', 'photo', 'photo_data.json');
  if (await fs.pathExists(photoDataPath)) {
    const photoHash = getFileHash(photoDataPath);

    if (cache.photoDataHash && cache.photoDataHash !== photoHash) {
      // 해시 변경됨 → 상세 비교
      try {
        const photoData = JSON.parse(await fs.readFile(photoDataPath, 'utf-8'));
        const newPhotos = Array.isArray(photoData) ? photoData : [];
        const oldSummary = cache.photoSummary || [];

        const oldMap = new Map(oldSummary.map(p => [p.id, p]));
        const newMap = new Map(newPhotos.map(p => [p.id, { id: p.id, camera: p.camera }]));

        // 사진 추가 감지
        for (const [id, photo] of newMap) {
          if (!oldMap.has(id)) {
            const cameraStr = photo.camera ? ` (${photo.camera})` : '';
            const descKo = `사진 추가: ID ${id}${cameraStr}`;
            const descJa = `写真追加: ID ${id}${cameraStr}`;
            if (!isDuplicate(today, 'photo', descKo)) {
              changelogData.entries.push({
                id: Date.now() + newEntries, date: today, category: 'photo',
                description: { ko: descKo, ja: descJa }
              });
              newEntries++;
            }
          }
        }

        // 사진 삭제 감지
        for (const [id, photo] of oldMap) {
          if (!newMap.has(id)) {
            const descKo = `사진 삭제: ID ${id}`;
            const descJa = `写真削除: ID ${id}`;
            if (!isDuplicate(today, 'photo', descKo)) {
              changelogData.entries.push({
                id: Date.now() + newEntries, date: today, category: 'photo',
                description: { ko: descKo, ja: descJa }
              });
              newEntries++;
            }
          }
        }

        // summary 업데이트
        cache.photoSummary = Array.from(newMap.values());

      } catch (e) {
        console.log('   ⚠️ 사진 데이터 비교 실패:', e.message);
      }
    } else if (!cache.photoSummary) {
      // 최초 실행: summary만 저장
      try {
        const photoData = JSON.parse(await fs.readFile(photoDataPath, 'utf-8'));
        const arr = Array.isArray(photoData) ? photoData : [];
        cache.photoSummary = arr.map(p => ({ id: p.id, camera: p.camera }));
      } catch (e) { /* ignore */ }
    }

    cache.photoDataHash = photoHash;
  }

  // Git 커밋 변경 감지 (변경된 파일 경로 기반으로 카테고리 자동 분류)
  try {
    const repoRoot = path.join(__dirname, '..');

    // cache.lastCommitHash가 있으면 그 이후 커밋만, 없으면 HEAD 단일 커밋 분석
    // (CI 환경에서는 캐시가 없으므로 HEAD 커밋만 처리하여 일기 업로드 등을 기록)
    let gitLogCmd;
    if (cache.lastCommitHash) {
      gitLogCmd = `git log ${cache.lastCommitHash}..HEAD --format="%H||%s" --no-merges`;
    } else {
      gitLogCmd = `git log -1 HEAD --format="%H||%s" --no-merges`;
    }

    const gitLog = execSync(
      gitLogCmd,
      { cwd: repoRoot, encoding: 'utf-8', timeout: 10000 }
    ).trim();

    if (gitLog) {
      const commits = gitLog.split('\n').filter(line => line.trim());

      for (const line of commits) {
        const separatorIndex = line.indexOf('||');
        if (separatorIndex === -1) continue;

        const commitHash = line.substring(0, separatorIndex).trim();
        const commitMsg = line.substring(separatorIndex + 2).trim();

        // 자동 생성 커밋 필터링 (배포/changelog 자동커밋만 제외)
        // Sync: 커밋은 일기 업로드이므로 제외하지 않음
        if (commitMsg.startsWith('Deploy:') ||
            commitMsg.startsWith('Content:') ||
            commitMsg === '변경사항 데이터 업데이트') {
          continue;
        }

        // 커밋에서 변경된 파일 목록 조회하여 카테고리 결정
        let category = 'blog'; // 기본값
        let contentFiles = []; // content/ 변경 파일 목록 (diary 처리용)
        try {
          const changedFiles = execSync(
            `git diff-tree --no-commit-id --name-only -r ${commitHash}`,
            { cwd: repoRoot, encoding: 'utf-8', timeout: 5000 }
          ).trim();

          if (changedFiles) {
            const files = changedFiles.split('\n');
            const hasAlbum = files.some(f => f.startsWith('album/'));
            const hasPhoto = files.some(f => f.startsWith('photo/'));
            const hasContent = files.some(f => f.startsWith('content/'));
            const hasBlog = files.some(f =>
              f.startsWith('templates/') || f.startsWith('build/') ||
              f.startsWith('static/') || f.startsWith('admin/') ||
              f.startsWith('.github/') || f.startsWith('changelog/') ||
              f === 'config.json' || f === 'package.json'
            );

            // 단일 카테고리만 변경된 경우 해당 카테고리로
            // 여러 카테고리가 혼합된 경우 blog로 유지
            if (hasAlbum && !hasPhoto && !hasContent && !hasBlog) {
              category = 'music';
            } else if (hasPhoto && !hasAlbum && !hasContent && !hasBlog) {
              category = 'photo';
            } else if (hasContent && !hasAlbum && !hasPhoto && !hasBlog) {
              category = 'diary';
              contentFiles = files.filter(f => f.startsWith('content/') && f.endsWith('.md'));
            }
          }
        } catch (e) {
          // diff-tree 실패 시 기본 blog 유지
        }

        if (category === 'diary' && contentFiles.length > 0) {
          // 일기: 각 변경된 파일에서 제목과 날짜를 직접 읽어 기록
          for (const contentFile of contentFiles) {
            try {
              const filePath = path.join(repoRoot, contentFile);
              let titleKo = '';
              let titleJa = '';
              let postDate = today; // 일기 자체 날짜 (설명에 표시용)

              // 현재 파일 내용에서 제목/날짜 추출 (gray-matter 사용)
              if (await fs.pathExists(filePath)) {
                const fileContent = await fs.readFile(filePath, 'utf-8');
                const { data: fm } = matter(fileContent);
                if (fm.date) postDate = toDateString(fm.date);
                titleKo = extractLanguageTitle(fm.title, 'ko', extractTitle(fm.title, ''));
                titleJa = extractLanguageTitle(fm.title, 'ja', titleKo);
                if (!titleJa) titleJa = titleKo;
              }

              // 신규 추가인지 수정인지 확인 (--diff-filter=A: Added 파일만)
              let isNewPost = false;
              try {
                const addedFiles = execSync(
                  `git diff-tree --no-commit-id --diff-filter=A --name-only -r ${commitHash}`,
                  { cwd: repoRoot, encoding: 'utf-8', timeout: 5000 }
                ).trim();
                isNewPost = addedFiles.split('\n').some(f => f.trim() === contentFile);
              } catch (e) { /* 판단 불가 시 수정으로 간주 */ }

              const slug = path.basename(contentFile, '.md');
              const displayTitle = titleKo || slug;
              const displayTitleJa = titleJa || displayTitle;

              // 일기 자체 날짜를 YY/MM/DD 형식으로 변환하여 설명에 포함
              const postDateShort = postDate.replace(/^(\d{4})-(\d{2})-(\d{2})$/, (_, y, m, d) =>
                `${y.slice(2)}/${m}/${d}`
              );
              const descKo = isNewPost
                ? `추가: [${postDateShort}] ${displayTitle}`
                : `수정: [${postDateShort}] ${displayTitle}`;
              const descJa = isNewPost
                ? `追加: [${postDateShort}] ${displayTitleJa}`
                : `修正: [${postDateShort}] ${displayTitleJa}`;

              // 변경사항 날짜는 항상 업로드한 날짜(today)로 기록
              if (!isDuplicate(today, 'diary', descKo)) {
                changelogData.entries.push({
                  id: Date.now() + newEntries,
                  date: today,
                  category: 'diary',
                  slug: slug,
                  description: { ko: descKo, ja: descJa },
                });
                newEntries++;
              }
            } catch (e) {
              // 개별 파일 처리 실패 시 건너뜀
            }
          }
        } else {
          // 일기 외 카테고리: 커밋 메시지를 그대로 사용
          const descKo = commitMsg;

          if (!isDuplicate(today, category, descKo)) {
            const entry = {
              id: Date.now() + newEntries,
              date: today,
              category: category,
              description: { ko: descKo, ja: '' },
            };
            if (category === 'blog') {
              entry.commitHash = commitHash;
            }
            changelogData.entries.push(entry);
            newEntries++;
          }
        }
      }
    }

    // 현재 HEAD 저장
    const currentHead = execSync(
      'git rev-parse HEAD',
      { cwd: repoRoot, encoding: 'utf-8', timeout: 5000 }
    ).trim();
    cache.lastCommitHash = currentHead;

  } catch (e) {
    // Git 사용 불가 시 건너뜀
    console.log('   ⚠️ Git 커밋 감지 건너뜀:', e.message);
  }

  // 변경사항이 있으면 날짜순(오름차순) 정렬 후 저장
  if (newEntries > 0) {
    changelogData.entries.sort((a, b) => {
      const dateCmp = a.date.localeCompare(b.date);
      if (dateCmp !== 0) return dateCmp;
      return a.id - b.id;
    });
    await fs.writeFile(changelogPath, JSON.stringify(changelogData, null, 2));
    console.log(`📋 변경사항 ${newEntries}건 자동 기록`);

    // public/changelog/ 에도 복사 (copyStaticFiles보다 나중에 실행되므로 재복사 필요)
    const publicChangelogPath = path.join(PATHS.output, 'changelog', 'changelog_data.json');
    await fs.ensureDir(path.join(PATHS.output, 'changelog'));
    await fs.copy(changelogPath, publicChangelogPath);
    console.log('   → public/changelog/changelog_data.json 업데이트');
  }
}

/**
 * 변경사항 페이지 생성
 */
async function generateChangelogPage() {
  const template = await loadTemplate('changelog.html');

  const html = template
    .replace(/\{\{blogTitle\}\}/g, escapeHtml(config.blog.title));

  await fs.writeFile(path.join(PATHS.output, 'changelog.html'), html);
}

/**
 * 음악 페이지 생성
 */
async function generateMusicPage() {
  const template = await loadTemplate('music.html');

  const html = template
    .replace(/\{\{blogTitle\}\}/g, escapeHtml(config.blog.title));

  await fs.writeFile(path.join(PATHS.output, 'music.html'), html);
}

/**
 * 사진 페이지 생성
 */
async function generatePhotoPage() {
  const template = await loadTemplate('photo.html');

  const html = template
    .replace(/\{\{blogTitle\}\}/g, escapeHtml(config.blog.title));

  await fs.writeFile(path.join(PATHS.output, 'photo.html'), html);
}

// 빌드 실행
if (require.main === module) {
  build();
}

module.exports = { build };
