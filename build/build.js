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
      await fs.copy(PATHS.static, PATHS.output);
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

      // HTML 변환
      const html = marked(content);

      // 발췌문 생성
      const excerpt = generateExcerpt(content, config.build.excerptLength || 200);

      return {
        filename,
        slug,
        title: data.title || slug,
        date: data.date || '',
        tags: normalizeTags(data.tags),
        author: data.author || config.blog.author,
        content: html,
        rawContent: content,
        excerpt,
        ...data
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
    .replace(/\{\{date\}\}/g, formatDate(post.date))
    .replace(/\{\{author\}\}/g, escapeHtml(post.author))
    .replace(/\{\{content\}\}/g, post.content)
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
    tags.forEach(tag => allTags.add(tag));
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
              ${post.tags.map(tag => 
                `<a href="/blog/tags/${encodeURIComponent(tag)}/" class="tag">#${escapeHtml(tag)}</a>`
              ).join(' ')}
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
        ${Array.from(allTags).slice(0, 20).map(tag => 
          `<a href="/blog/tags/${encodeURIComponent(tag)}/" class="tag-cloud-item">${escapeHtml(tag)}</a>`
        ).join('\n        ')}
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
      if (!tagMap.has(tag)) {
        tagMap.set(tag, []);
      }
      tagMap.get(tag).push(post);
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
      .replace(/\{\{tag\}\}/g, escapeHtml(tag))
      .replace(/\{\{blogTitle\}\}/g, escapeHtml(config.blog.title))
      .replace(/\{\{posts\}\}/g, postsHtml)
      .replace(/\{\{postCount\}\}/g, tagPosts.length);

    const outputDir = path.join(PATHS.output, 'tags', tag);
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
  
  // 이미 배열이면 문자열만 필터링
  if (Array.isArray(tags)) {
    return tags
      .filter(tag => tag && typeof tag === 'string')
      .map(tag => tag.trim())
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
