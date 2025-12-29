/**
 * 블로그 빌드 스크립트
 * content/ 폴더의 마크다운 파일들을 읽어서 public/ 폴더에 HTML 생성
 */

const fs = require('fs-extra');
const path = require('path');
const { marked } = require('marked');
const matter = require('gray-matter');

// 설정 로드
const config = require('../config.json');

// 경로 설정
const PATHS = {
  content: path.join(__dirname, '..', config.paths.content),
  templates: path.join(__dirname, '..', config.paths.templates),
  static: path.join(__dirname, '..', config.paths.static),
  output: path.join(__dirname, '..', config.paths.output)
};

// 빌드 메인 함수
async function build() {
  console.log('🚀 블로그 빌드 시작...\n');

  try {
    // 1. output 폴더 정리 및 생성
    console.log('📁 출력 폴더 준비 중...');
    await fs.emptyDir(PATHS.output);
    await fs.ensureDir(PATHS.output);

    // 2. static 폴더 복사
    console.log('📋 정적 파일 복사 중...');
    if (await fs.pathExists(PATHS.static)) {
      await fs.copy(PATHS.static, path.join(PATHS.output, 'static'));
      console.log('   → static 폴더 복사 완료');
    }

    // 2-1. admin 폴더 복사
    console.log('⚙️  관리자 페이지 복사 중...');
    const adminPath = path.join(__dirname, '..', 'admin');
    if (await fs.pathExists(adminPath)) {
      await fs.copy(adminPath, path.join(PATHS.output, 'admin'));
      console.log('   → admin 폴더 복사 완료');
    }

    // 3. content 폴더 확인
    if (!await fs.pathExists(PATHS.content)) {
      console.log('⚠️  content 폴더가 없습니다. 생성합니다...');
      await fs.ensureDir(PATHS.content);
      console.log('ℹ️  content 폴더에 마크다운 파일을 추가해주세요.');
      return;
    }

    // 4. 모든 마크다운 파일 읽기
    console.log('📖 마크다운 파일 읽는 중...');
    const posts = await loadAllPosts();
    console.log(`   → ${posts.length}개의 글을 찾았습니다.\n`);

    if (posts.length === 0) {
      console.log('ℹ️  작성된 글이 없습니다.');
      await createEmptyIndexPage();
      return;
    }

    // 5. 각 포스트를 HTML로 변환
    console.log('🔨 개별 글 페이지 생성 중...');
    for (const post of posts) {
      await generatePostPage(post);
      console.log(`   ✓ ${post.slug}`);
    }

    // 6. 인덱스 페이지 생성 (글 목록)
    console.log('\n📝 메인 페이지 생성 중...');
    await generateIndexPage(posts);

    // 7. 태그 페이지 생성
    console.log('🏷️  태그 페이지 생성 중...');
    await generateTagPages(posts);

    // 8. RSS 피드 생성 (선택)
    console.log('📡 RSS 피드 생성 중...');
    await generateRSSFeed(posts);

    // 9. 검색 인덱스 생성 (클라이언트 검색용)
    if (config.features && config.features.search) {
      console.log('🔍 검색 인덱스 생성 중...');
      await generateSearchIndex(posts);
    }

    console.log('\n✅ 빌드 완료!');
    console.log(`📂 출력 위치: ${PATHS.output}`);
    console.log(`📊 총 ${posts.length}개의 글이 생성되었습니다.\n`);

  } catch (error) {
    console.error('❌ 빌드 실패:', error);
    process.exit(1);
  }
}

/**
 * 모든 포스트 로드
 */
async function loadAllPosts() {
  const files = await fs.readdir(PATHS.content);
  const mdFiles = files.filter(file => file.endsWith('.md'));

  const posts = await Promise.all(
    mdFiles.map(async filename => {
      const filepath = path.join(PATHS.content, filename);
      const fileContent = await fs.readFile(filepath, 'utf-8');

      // front matter 파싱
      const { data, content } = matter(fileContent);

      // 슬러그 생성 (URL용)
      const slug = filename.replace(/\.md$/, '').replace(/^\d{4}-\d{2}-\d{2}-/, '');

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

      // HTML 변환 (정제된 content 사용)
      const htmlKo = marked(contentKo || content);
      const htmlJa = marked(contentJa || content);
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
        author: data.author || config.blog.author,
        content: html,  // 기본 HTML (한국어 우선)
        contentKo: htmlKo,  // 한국어 HTML
        contentJa: htmlJa,  // 일본어 HTML
        rawContent: content,
        rawContentKo: contentKo,  // 한국어 원본
        rawContentJa: contentJa,  // 일본어 원본
        excerpt
        // ...data 제거! (title 덮어쓰기 방지)
      };
    })
  );

  // 날짜순 정렬 (최신순)
  return posts.sort((a, b) => new Date(b.date) - new Date(a.date));
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
    .replace(/\{\{date\}\}/g, formatDate(post.date))
    .replace(/\{\{author\}\}/g, escapeHtml(post.author))
    .replace(/\{\{content\}\}/g, post.content)
    .replace(/\{\{contentKo\}\}/g, post.contentKo || post.content)
    .replace(/\{\{contentJa\}\}/g, post.contentJa || post.content)
    .replace(/\{\{tags\}\}/g, generateTagsHtml(post.tags))
    .replace(/\{\{blogTitle\}\}/g, escapeHtml(config.blog.title))
    .replace(/\{\{blogUrl\}\}/g, config.blog.url)
    .replace(/\{\{description\}\}/g, escapeHtml(post.excerpt));

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
  
  const postsPerPage = config.build.postsPerPage || 10;
  const recentPosts = posts.slice(0, postsPerPage);

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
      <a href="/blog/admin/login.html" class="btn-primary">✍️ 글 쓰러 가기</a>
    </div>
  ` : '';

  // 글 목록 HTML 생성 (카드 형태)
  const postsHtml = recentPosts.map(post => `
    <article class="post-card">
      <div class="post-card-content">
        <h2 class="post-card-title">
          <a href="/blog/posts/${post.slug}/">${escapeHtml(post.title)}</a>
        </h2>
        <div class="post-meta">
          <time datetime="${post.date}">${formatDate(post.date)}</time>
          ${post.tags && post.tags.length > 0 ? `
            <span class="post-tags">
              ${post.tags.map(tag => {
                // 태그를 문자열로 변환하고 안전한 URL로 변경
                const safeTag = String(tag).replace(/[<>:"/\\|?*]/g, '-');
                return `<a href="/blog/tags/${encodeURIComponent(safeTag)}/" class="tag">#${escapeHtml(String(tag))}</a>`;
              }).join(' ')}
            </span>
          ` : ''}
        </div>
        <p class="post-excerpt">${escapeHtml(post.excerpt)}</p>
        <a href="/blog/posts/${post.slug}/" class="read-more">더 읽기 →</a>
      </div>
    </article>
  `).join('\n');

  // 태그 클라우드 HTML 생성
  const tagsSection = allTags.size > 0 ? `
    <section class="tags-cloud-section">
      <div class="section-header">
        <h2 class="section-title">태그</h2>
        <a href="/blog/tags/" class="see-all">전체 보기 →</a>
      </div>
      <div class="tags-cloud">
        ${Array.from(allTags).slice(0, 20).map(tag => {
          // 태그를 문자열로 변환하고 안전한 URL로 변경
          const safeTag = String(tag).replace(/[<>:"/\\|?*]/g, '-');
          return `<a href="/blog/tags/${encodeURIComponent(safeTag)}/" class="tag-cloud-item">${escapeHtml(String(tag))}</a>`;
        }).join('\n        ')}
      </div>
    </section>
  ` : '';

  const html = template
    .replace(/\{\{blogTitle\}\}/g, escapeHtml(config.blog.title))
    .replace(/\{\{blogDescription\}\}/g, escapeHtml(config.blog.description))
    .replace(/\{\{posts\}\}/g, postsHtml)
    .replace(/\{\{totalPosts\}\}/g, posts.length)
    .replace(/\{\{totalTags\}\}/g, allTags.size)
    .replace(/\{\{emptyState\}\}/g, emptyState)
    .replace(/\{\{tagsSection\}\}/g, tagsSection);

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
            <a href="/blog/posts/${post.slug}/">${escapeHtml(post.title)}</a>
          </h2>
          <div class="post-meta">
            <time datetime="${post.date}">${formatDate(post.date)}</time>
          </div>
          <p class="post-excerpt">${escapeHtml(post.excerpt)}</p>
          <a href="/blog/posts/${post.slug}/" class="read-more">더 읽기 →</a>
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
 * 검색 인덱스 생성 (JSON)
 */
async function generateSearchIndex(posts) {
  const searchIndex = posts.map(post => ({
    title: post.title,
    slug: post.slug,
    date: post.date,
    tags: post.tags,
    excerpt: post.excerpt
  }));

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
    return match[1].trim();
  }
  
  // 언어 섹션이 없으면 모든 주석 제거
  return content
    .replace(/<!--\s*\w+\s*-->/gi, '')
    .replace(/<!--\s*\/\w+\s*-->/gi, '')
    .trim();
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

// 빌드 실행
if (require.main === module) {
  build();
}

module.exports = { build };