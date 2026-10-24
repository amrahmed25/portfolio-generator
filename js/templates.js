/**
 * templates.js — Template Gallery page module for PortfolioHub
 * Renders template cards, preview modal, and handles template selection.
 */

import supabase from './supabase-client.js';
import { showToast } from './utils.js';

// ─── Template Data ────────────────────────────────────────────────────────────
const TEMPLATES = [
  {
    id: 'minimal',
    name: 'Minimal',
    description: 'Clean, focused, and professional. Let your work speak for itself with elegant typography and generous whitespace.',
    features: [
      'Centered single-column layout',
      'Large hero with subtle animation',
      'Distraction-free project showcase'
    ],
    tag: 'Most Popular',
    tagColor: '#2563EB',
    color: '#FFFFFF',
    accentColor: '#2563EB',
    textColor: '#0F172A',
    gradient: 'linear-gradient(135deg, #F8FAFC 0%, #E0F2FE 100%)',
    preview: buildMinimalPreview,
  },
  {
    id: 'developer',
    name: 'Developer',
    description: 'Built for coders. Dark sidebar, terminal-inspired aesthetic, and GitHub integration highlights your technical depth.',
    features: [
      'Dark sidebar with terminal motif',
      'Code snippet showcases',
      'GitHub stats & activity feed'
    ],
    tag: 'Dev-Friendly',
    tagColor: '#38BDF8',
    color: '#0F172A',
    accentColor: '#38BDF8',
    textColor: '#F8FAFC',
    gradient: 'linear-gradient(135deg, #0F172A 0%, #1E3A8A 100%)',
    preview: buildDeveloperPreview,
  },
  {
    id: 'creative',
    name: 'Creative',
    description: 'For visual storytellers. Bold imagery, asymmetric layouts, and vibrant colors make your portfolio unforgettable.',
    features: [
      'Full-bleed asymmetric grid',
      'Bold typography & vivid colors',
      'Immersive project galleries'
    ],
    tag: 'Eye-Catching',
    tagColor: '#F59E0B',
    color: '#F8FAFC',
    accentColor: '#F59E0B',
    textColor: '#0F172A',
    gradient: 'linear-gradient(135deg, #FEF3C7 0%, #FDE68A 60%, #FCA5A5 100%)',
    preview: buildCreativePreview,
  },
  {
    id: 'professional',
    name: 'Professional',
    description: 'Corporate and executive-ready. Two-column layout with a timeline section — perfect for consultants and leaders.',
    features: [
      'Two-column resume-style layout',
      'Vertical experience timeline',
      'Print-optimized styling'
    ],
    tag: 'Executive',
    tagColor: '#1E3A8A',
    color: '#FFFFFF',
    accentColor: '#1E3A8A',
    textColor: '#0F172A',
    gradient: 'linear-gradient(135deg, #EEF2FF 0%, #C7D2FE 100%)',
    preview: buildProfessionalPreview,
  },
  {
    id: 'freelancer',
    name: 'Freelancer',
    description: 'Convert visitors into clients. Services-first design with pricing cards, testimonials, and strong CTAs.',
    features: [
      'Services & pricing section up front',
      'Client testimonials carousel',
      'Contact form with call-to-action'
    ],
    tag: 'Conversion-First',
    tagColor: '#10B981',
    color: '#F0FDF4',
    accentColor: '#10B981',
    textColor: '#0F172A',
    gradient: 'linear-gradient(135deg, #DCFCE7 0%, #A7F3D0 100%)',
    preview: buildFreelancerPreview,
  },
  {
    id: 'link-in-bio',
    name: 'Link-in-Bio',
    description: 'All your links in one place. Mobile-first, compact, and perfect for social media bios and personal branding.',
    features: [
      'Linktree-style link cards',
      'Social media badges',
      'Mobile-first compact design'
    ],
    tag: 'Mobile-First',
    tagColor: '#8B5CF6',
    color: '#FAF5FF',
    accentColor: '#8B5CF6',
    textColor: '#0F172A',
    gradient: 'linear-gradient(135deg, #FAF5FF 0%, #E9D5FF 100%)',
    preview: buildLinkInBioPreview,
  }
];

// ─── Current template for preview ─────────────────────────────────────────────
let currentPreviewTemplateId = null;
let currentUser = null;

// ─── Init ─────────────────────────────────────────────────────────────────────
async function init() {
  await resolveUser();
  renderTemplateGallery();
  initPreviewModal();
}

// ─── Auth ─────────────────────────────────────────────────────────────────────
async function resolveUser() {
  try {
    const { data: { session } } = await supabase.auth.getSession();
    currentUser = session?.user || null;
  } catch (_) {
    currentUser = null;
  }
}

// ─── Render Gallery ───────────────────────────────────────────────────────────
function renderTemplateGallery() {
  const grid = document.getElementById('template-grid');
  if (!grid) return;

  grid.innerHTML = '';
  TEMPLATES.forEach(tpl => {
    const card = buildTemplateCard(tpl);
    grid.appendChild(card);
  });
}

function buildTemplateCard(tpl) {
  const card = document.createElement('div');
  card.className = 'template-card';
  card.dataset.templateId = tpl.id;

  const featuresHtml = tpl.features.map(f =>
    `<li class="template-feature-item">
       <svg class="feature-check" width="14" height="14" fill="none" stroke="${tpl.accentColor}" stroke-width="2.5" viewBox="0 0 24 24"><polyline points="20 6 9 17 4 12"/></svg>
       ${f}
     </li>`
  ).join('');

  card.innerHTML = `
    <div class="template-card-preview" style="background:${tpl.gradient};" data-template-id="${tpl.id}">
      ${tpl.tag ? `<div class="template-tag" style="background:${tpl.tagColor};">${tpl.tag}</div>` : ''}
      <div class="template-preview-frame">
        ${tpl.preview(tpl, 'card')}
      </div>
    </div>
    <div class="template-card-body">
      <h3 class="template-card-name">${tpl.name}</h3>
      <p class="template-card-desc">${tpl.description}</p>
      <ul class="template-features-list">
        ${featuresHtml}
      </ul>
      <div class="template-card-actions">
        <button class="btn btn-outline template-preview-btn" data-template-id="${tpl.id}">
          <svg width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
          Preview
        </button>
        <button class="btn btn-primary template-use-btn" data-template-id="${tpl.id}">
          Use Template
          <svg width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/></svg>
        </button>
      </div>
    </div>
  `;

  // Preview click
  card.querySelector('.template-preview-btn').addEventListener('click', () => {
    openTemplatePreview(tpl.id);
  });
  // Preview area click
  card.querySelector('.template-card-preview').addEventListener('click', () => {
    openTemplatePreview(tpl.id);
  });
  // Use template
  card.querySelector('.template-use-btn').addEventListener('click', (e) => {
    e.stopPropagation();
    selectTemplate(tpl.id);
  });

  return card;
}

// ─── Preview Modal ────────────────────────────────────────────────────────────
function initPreviewModal() {
  const overlay  = document.getElementById('template-preview-overlay');
  const closeBtn = document.getElementById('preview-modal-close');
  const useBtnTop    = document.getElementById('preview-use-btn');
  const useBtnBottom = document.getElementById('preview-use-btn-bottom');

  closeBtn?.addEventListener('click', closePreviewModal);
  overlay?.addEventListener('click', e => {
    if (e.target === overlay) closePreviewModal();
  });
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && overlay?.classList.contains('active')) closePreviewModal();
  });

  useBtnTop?.addEventListener('click', () => {
    if (currentPreviewTemplateId) selectTemplate(currentPreviewTemplateId);
  });
  useBtnBottom?.addEventListener('click', () => {
    if (currentPreviewTemplateId) selectTemplate(currentPreviewTemplateId);
  });
}

function openTemplatePreview(templateId) {
  const tpl = TEMPLATES.find(t => t.id === templateId);
  if (!tpl) return;

  currentPreviewTemplateId = templateId;

  document.getElementById('preview-modal-title').textContent = tpl.name;
  document.getElementById('preview-modal-desc').textContent  = tpl.description;

  const bodyEl = document.getElementById('preview-modal-body');
  if (bodyEl) {
    bodyEl.innerHTML = `
      <div class="preview-modal-frame" style="background:${tpl.gradient};">
        ${tpl.preview(tpl, 'modal')}
      </div>
    `;
  }

  const featuresEl = document.getElementById('preview-features');
  if (featuresEl) {
    featuresEl.innerHTML = tpl.features.map(f =>
      `<span class="preview-feature-pill">
         <svg width="12" height="12" fill="none" stroke="${tpl.accentColor}" stroke-width="2.5" viewBox="0 0 24 24"><polyline points="20 6 9 17 4 12"/></svg>
         ${f}
       </span>`
    ).join('');
  }

  const overlay = document.getElementById('template-preview-overlay');
  overlay?.classList.add('active');
  document.body.style.overflow = 'hidden';
}

function closePreviewModal() {
  const overlay = document.getElementById('template-preview-overlay');
  overlay?.classList.remove('active');
  document.body.style.overflow = '';
  currentPreviewTemplateId = null;
}

// ─── Select Template ──────────────────────────────────────────────────────────
async function selectTemplate(templateId) {
  if (!currentUser) {
    // Redirect to signup with template param
    window.location.href = `signup.html?template=${encodeURIComponent(templateId)}`;
    return;
  }

  // Check if user already has a portfolio
  try {
    const { data: existing } = await supabase
      .from('portfolios')
      .select('id, template_id')
      .eq('user_id', currentUser.id)
      .maybeSingle();

    if (existing) {
      // Update template
      const { error } = await supabase
        .from('portfolios')
        .update({ template_id: templateId, updated_at: new Date().toISOString() })
        .eq('id', existing.id);

      if (error) throw error;
      showToast(`Template switched to "${TEMPLATES.find(t => t.id === templateId)?.name}"! Redirecting to builder…`, 'success');
      setTimeout(() => {
        window.location.href = `builder.html?template=${encodeURIComponent(templateId)}`;
      }, 1200);
    } else {
      // Create portfolio and go to builder
      const { error } = await supabase
        .from('portfolios')
        .insert([{
          user_id: currentUser.id,
          template_id: templateId,
          is_published: false,
          created_at: new Date().toISOString()
        }]);

      if (error) throw error;
      window.location.href = `builder.html?template=${encodeURIComponent(templateId)}`;
    }
  } catch (err) {
    console.error('Template selection error:', err);
    showToast('Something went wrong. Please try again.', 'error');
  }
}

// ─── Template Preview Builders ────────────────────────────────────────────────

function buildMinimalPreview(tpl, mode) {
  const scale = mode === 'modal' ? 1 : 0.55;
  return `
    <div class="tpl-preview tpl-minimal" style="transform:scale(${scale});transform-origin:top center;background:#fff;border-radius:8px;overflow:hidden;width:360px;box-shadow:0 8px 32px rgba(0,0,0,0.12);">
      <div style="padding:24px;text-align:center;border-bottom:1px solid #F1F5F9;">
        <div style="width:56px;height:56px;border-radius:50%;background:${tpl.accentColor};margin:0 auto 12px;display:flex;align-items:center;justify-content:center;color:#fff;font-size:22px;font-weight:700;">J</div>
        <div style="font-size:18px;font-weight:700;color:#0F172A;margin-bottom:4px;">John Designer</div>
        <div style="font-size:12px;color:#64748B;">Product Designer · San Francisco</div>
        <div style="margin-top:12px;display:flex;gap:8px;justify-content:center;">
          <div style="padding:6px 14px;background:${tpl.accentColor};color:#fff;border-radius:6px;font-size:11px;font-weight:600;">Hire Me</div>
          <div style="padding:6px 14px;border:1px solid #E2E8F0;color:#0F172A;border-radius:6px;font-size:11px;">Resume</div>
        </div>
      </div>
      <div style="padding:16px;">
        <div style="font-size:11px;font-weight:700;color:#64748B;text-transform:uppercase;letter-spacing:1px;margin-bottom:10px;">Projects</div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;">
          <div style="background:#F8FAFC;border-radius:6px;height:60px;border:1px solid #E2E8F0;"></div>
          <div style="background:#F8FAFC;border-radius:6px;height:60px;border:1px solid #E2E8F0;"></div>
          <div style="background:#F8FAFC;border-radius:6px;height:60px;border:1px solid #E2E8F0;"></div>
          <div style="background:#F8FAFC;border-radius:6px;height:60px;border:1px solid #E2E8F0;"></div>
        </div>
      </div>
    </div>
  `;
}

function buildDeveloperPreview(tpl, mode) {
  const scale = mode === 'modal' ? 1 : 0.55;
  return `
    <div class="tpl-preview tpl-developer" style="transform:scale(${scale});transform-origin:top center;background:#0F172A;border-radius:8px;overflow:hidden;width:360px;display:flex;box-shadow:0 8px 32px rgba(0,0,0,0.4);">
      <!-- Sidebar -->
      <div style="width:100px;background:#1E293B;padding:16px;display:flex;flex-direction:column;align-items:center;gap:12px;">
        <div style="width:44px;height:44px;border-radius:50%;background:${tpl.accentColor};display:flex;align-items:center;justify-content:center;color:#0F172A;font-size:16px;font-weight:700;">A</div>
        <div style="font-size:9px;color:#94A3B8;text-align:center;line-height:1.4;">Alex Dev<br/><span style="color:${tpl.accentColor};">Full Stack</span></div>
        <div style="width:100%;border-top:1px solid #334155;padding-top:10px;display:flex;flex-direction:column;gap:6px;">
          <div style="height:8px;border-radius:4px;background:#334155;"></div>
          <div style="height:8px;border-radius:4px;background:#334155;width:70%;"></div>
          <div style="height:8px;border-radius:4px;background:#334155;width:85%;"></div>
          <div style="height:8px;border-radius:4px;background:#334155;"></div>
        </div>
      </div>
      <!-- Main -->
      <div style="flex:1;padding:16px;">
        <div style="font-family:monospace;font-size:9px;color:${tpl.accentColor};margin-bottom:10px;">~/portfolio $ ls projects/</div>
        <div style="display:flex;flex-direction:column;gap:8px;">
          <div style="background:#1E293B;border-radius:4px;padding:8px;border-left:3px solid ${tpl.accentColor};">
            <div style="font-size:9px;color:#F8FAFC;font-weight:600;margin-bottom:4px;">react-dashboard</div>
            <div style="display:flex;gap:4px;">
              <span style="font-size:7px;background:#334155;color:#94A3B8;padding:2px 5px;border-radius:3px;">React</span>
              <span style="font-size:7px;background:#334155;color:#94A3B8;padding:2px 5px;border-radius:3px;">TypeScript</span>
            </div>
          </div>
          <div style="background:#1E293B;border-radius:4px;padding:8px;border-left:3px solid #7C3AED;">
            <div style="font-size:9px;color:#F8FAFC;font-weight:600;margin-bottom:4px;">api-gateway</div>
            <div style="display:flex;gap:4px;">
              <span style="font-size:7px;background:#334155;color:#94A3B8;padding:2px 5px;border-radius:3px;">Node.js</span>
              <span style="font-size:7px;background:#334155;color:#94A3B8;padding:2px 5px;border-radius:3px;">Docker</span>
            </div>
          </div>
          <div style="background:#1E293B;border-radius:4px;padding:8px;border-left:3px solid #10B981;">
            <div style="font-size:9px;color:#F8FAFC;font-weight:600;margin-bottom:4px;">ml-pipeline</div>
            <div style="display:flex;gap:4px;">
              <span style="font-size:7px;background:#334155;color:#94A3B8;padding:2px 5px;border-radius:3px;">Python</span>
              <span style="font-size:7px;background:#334155;color:#94A3B8;padding:2px 5px;border-radius:3px;">TensorFlow</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  `;
}

function buildCreativePreview(tpl, mode) {
  const scale = mode === 'modal' ? 1 : 0.55;
  return `
    <div class="tpl-preview tpl-creative" style="transform:scale(${scale});transform-origin:top center;background:#FFFBF0;border-radius:8px;overflow:hidden;width:360px;box-shadow:0 8px 32px rgba(0,0,0,0.12);">
      <!-- Hero: bold asymmetric -->
      <div style="position:relative;height:120px;background:linear-gradient(135deg,#F59E0B 0%,#EF4444 100%);display:flex;align-items:flex-end;padding:14px;">
        <div style="font-size:22px;font-weight:900;color:#fff;line-height:1.1;letter-spacing:-1px;">SARA<br/>CREATES</div>
        <div style="position:absolute;right:14px;top:14px;width:54px;height:54px;border-radius:50%;background:#fff;border:3px solid #F59E0B;overflow:hidden;display:flex;align-items:center;justify-content:center;font-size:20px;font-weight:800;color:#F59E0B;">S</div>
      </div>
      <!-- Gallery grid -->
      <div style="display:grid;grid-template-columns:2fr 1fr;gap:4px;padding:8px;background:#fff;">
        <div style="height:90px;border-radius:6px;background:linear-gradient(135deg,#FDE68A,#FCA5A5);"></div>
        <div style="display:flex;flex-direction:column;gap:4px;">
          <div style="flex:1;border-radius:6px;background:linear-gradient(135deg,#A5F3FC,#6EE7B7);"></div>
          <div style="flex:1;border-radius:6px;background:linear-gradient(135deg,#DDD6FE,#FBB6CE);"></div>
        </div>
        <div style="height:50px;border-radius:6px;background:linear-gradient(135deg,#BAE6FD,#C7D2FE);"></div>
        <div style="height:50px;border-radius:6px;background:linear-gradient(135deg,#FEF3C7,#FDE68A);"></div>
      </div>
    </div>
  `;
}

function buildProfessionalPreview(tpl, mode) {
  const scale = mode === 'modal' ? 1 : 0.55;
  return `
    <div class="tpl-preview tpl-professional" style="transform:scale(${scale});transform-origin:top center;background:#fff;border-radius:8px;overflow:hidden;width:360px;box-shadow:0 8px 32px rgba(0,0,0,0.12);">
      <!-- Header bar -->
      <div style="background:${tpl.accentColor};color:#fff;padding:16px 20px;display:flex;align-items:center;gap:14px;">
        <div style="width:48px;height:48px;border-radius:50%;background:rgba(255,255,255,0.2);display:flex;align-items:center;justify-content:center;font-size:18px;font-weight:700;border:2px solid rgba(255,255,255,0.4);">M</div>
        <div>
          <div style="font-size:15px;font-weight:700;">Michael Roberts</div>
          <div style="font-size:10px;opacity:0.8;">Senior Product Manager · New York</div>
        </div>
      </div>
      <!-- Two-col body -->
      <div style="display:grid;grid-template-columns:5fr 4fr;gap:0;">
        <!-- Left col -->
        <div style="padding:14px;border-right:1px solid #E2E8F0;">
          <div style="font-size:9px;font-weight:700;color:${tpl.accentColor};text-transform:uppercase;letter-spacing:0.8px;margin-bottom:8px;">Experience</div>
          <div style="position:relative;padding-left:12px;margin-bottom:8px;border-left:2px solid ${tpl.accentColor};">
            <div style="font-size:9px;font-weight:600;color:#0F172A;">Product Lead — TechCorp</div>
            <div style="font-size:8px;color:#64748B;">2021 – Present</div>
            <div style="height:16px;background:#F1F5F9;border-radius:3px;margin-top:4px;"></div>
          </div>
          <div style="position:relative;padding-left:12px;border-left:2px solid #E2E8F0;">
            <div style="font-size:9px;font-weight:600;color:#0F172A;">PM — StartupXYZ</div>
            <div style="font-size:8px;color:#64748B;">2018 – 2021</div>
            <div style="height:16px;background:#F1F5F9;border-radius:3px;margin-top:4px;"></div>
          </div>
        </div>
        <!-- Right col -->
        <div style="padding:14px;">
          <div style="font-size:9px;font-weight:700;color:${tpl.accentColor};text-transform:uppercase;letter-spacing:0.8px;margin-bottom:8px;">Skills</div>
          <div style="display:flex;flex-direction:column;gap:5px;">
            <div>
              <div style="display:flex;justify-content:space-between;margin-bottom:2px;"><span style="font-size:8px;color:#0F172A;">Strategy</span><span style="font-size:8px;color:#64748B;">95%</span></div>
              <div style="height:4px;background:#E2E8F0;border-radius:2px;"><div style="width:95%;height:100%;background:${tpl.accentColor};border-radius:2px;"></div></div>
            </div>
            <div>
              <div style="display:flex;justify-content:space-between;margin-bottom:2px;"><span style="font-size:8px;color:#0F172A;">Roadmapping</span><span style="font-size:8px;color:#64748B;">88%</span></div>
              <div style="height:4px;background:#E2E8F0;border-radius:2px;"><div style="width:88%;height:100%;background:${tpl.accentColor};border-radius:2px;"></div></div>
            </div>
            <div>
              <div style="display:flex;justify-content:space-between;margin-bottom:2px;"><span style="font-size:8px;color:#0F172A;">Data Analysis</span><span style="font-size:8px;color:#64748B;">80%</span></div>
              <div style="height:4px;background:#E2E8F0;border-radius:2px;"><div style="width:80%;height:100%;background:${tpl.accentColor};border-radius:2px;"></div></div>
            </div>
          </div>
        </div>
      </div>
    </div>
  `;
}

function buildFreelancerPreview(tpl, mode) {
  const scale = mode === 'modal' ? 1 : 0.55;
  return `
    <div class="tpl-preview tpl-freelancer" style="transform:scale(${scale});transform-origin:top center;background:#F0FDF4;border-radius:8px;overflow:hidden;width:360px;box-shadow:0 8px 32px rgba(0,0,0,0.12);">
      <!-- Hero CTA -->
      <div style="padding:20px;text-align:center;background:#fff;border-bottom:1px solid #DCFCE7;">
        <div style="width:50px;height:50px;border-radius:50%;background:${tpl.accentColor};margin:0 auto 10px;display:flex;align-items:center;justify-content:center;color:#fff;font-size:20px;font-weight:700;">L</div>
        <div style="font-size:14px;font-weight:700;color:#0F172A;">Lisa Freelance</div>
        <div style="font-size:10px;color:#64748B;margin-bottom:10px;">Brand Designer · Available for hire</div>
        <div style="display:inline-block;padding:7px 18px;background:${tpl.accentColor};color:#fff;border-radius:20px;font-size:10px;font-weight:700;">🟢 Available — Book a Call</div>
      </div>
      <!-- Services -->
      <div style="padding:12px;display:grid;grid-template-columns:1fr 1fr;gap:8px;">
        <div style="background:#fff;border-radius:8px;padding:10px;border:1px solid #DCFCE7;text-align:center;">
          <div style="font-size:16px;margin-bottom:4px;">🎨</div>
          <div style="font-size:9px;font-weight:700;color:#0F172A;">Brand Identity</div>
          <div style="font-size:10px;color:${tpl.accentColor};font-weight:600;margin-top:4px;">from $500</div>
        </div>
        <div style="background:#fff;border-radius:8px;padding:10px;border:1px solid #DCFCE7;text-align:center;">
          <div style="font-size:16px;margin-bottom:4px;">📱</div>
          <div style="font-size:9px;font-weight:700;color:#0F172A;">UI Design</div>
          <div style="font-size:10px;color:${tpl.accentColor};font-weight:600;margin-top:4px;">from $800</div>
        </div>
        <div style="background:#fff;border-radius:8px;padding:10px;border:1px solid #DCFCE7;text-align:center;">
          <div style="font-size:16px;margin-bottom:4px;">🌐</div>
          <div style="font-size:9px;font-weight:700;color:#0F172A;">Web Design</div>
          <div style="font-size:10px;color:${tpl.accentColor};font-weight:600;margin-top:4px;">from $1200</div>
        </div>
        <div style="background:#fff;border-radius:8px;padding:10px;border:1px solid #DCFCE7;text-align:center;">
          <div style="font-size:16px;margin-bottom:4px;">✍️</div>
          <div style="font-size:9px;font-weight:700;color:#0F172A;">Consulting</div>
          <div style="font-size:10px;color:${tpl.accentColor};font-weight:600;margin-top:4px;">$120/hr</div>
        </div>
      </div>
    </div>
  `;
}

function buildLinkInBioPreview(tpl, mode) {
  const scale = mode === 'modal' ? 1 : 0.55;
  const links = [
    { icon: '🌐', label: 'My Portfolio', color: tpl.accentColor },
    { icon: '🐦', label: 'Twitter / X',  color: '#1DA1F2' },
    { icon: '💼', label: 'LinkedIn',     color: '#0A66C2' },
    { icon: '💻', label: 'GitHub',       color: '#24292E' },
    { icon: '📸', label: 'Instagram',    color: '#E1306C' },
    { icon: '▶️', label: 'YouTube',      color: '#FF0000' },
  ];
  const linksHtml = links.map(l => `
    <div style="display:flex;align-items:center;gap:10px;background:#fff;border-radius:10px;padding:10px 14px;border:1px solid #E9D5FF;margin-bottom:6px;cursor:pointer;transition:all .2s;">
      <span style="font-size:14px;">${l.icon}</span>
      <span style="font-size:10px;font-weight:600;color:#0F172A;flex:1;">${l.label}</span>
      <svg width="12" height="12" fill="none" stroke="#94A3B8" stroke-width="2" viewBox="0 0 24 24"><line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/></svg>
    </div>
  `).join('');
  return `
    <div class="tpl-preview tpl-link-in-bio" style="transform:scale(${scale});transform-origin:top center;background:${tpl.gradient};border-radius:8px;overflow:hidden;width:260px;margin:0 auto;padding:20px;box-shadow:0 8px 32px rgba(0,0,0,0.12);">
      <div style="text-align:center;margin-bottom:16px;">
        <div style="width:56px;height:56px;border-radius:50%;background:${tpl.accentColor};margin:0 auto 8px;display:flex;align-items:center;justify-content:center;color:#fff;font-size:22px;font-weight:700;border:3px solid #fff;box-shadow:0 0 0 3px ${tpl.accentColor}30;">K</div>
        <div style="font-size:13px;font-weight:700;color:#0F172A;">@kira.links</div>
        <div style="font-size:9px;color:#64748B;margin-top:2px;">Creator · Designer · Speaker</div>
      </div>
      ${linksHtml}
    </div>
  `;
}

export { init };
