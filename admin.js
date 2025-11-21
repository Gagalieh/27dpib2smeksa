// Minimal admin stub using Supabase client (supabase-js must be included in production build)
// This stub uses CONFIG from a global environment injection. Replace with the proper supabase client in production.

const ADMIN_CONFIG = {
  SUPABASE_URL: window.__ENV__?.SUPABASE_URL || '',
  SUPABASE_ANON_KEY: window.__ENV__?.SUPABASE_ANON_KEY || '',
  CLOUDINARY_CLOUD_NAME: window.__ENV__?.CLOUDINARY_CLOUD_NAME || '',
  CLOUDINARY_UPLOAD_PRESET: window.__ENV__?.CLOUDINARY_UPLOAD_PRESET || ''
}

// Lazy load supabase client from CDN when admin page loads
async function loadSupabase(){
  if(window.supabase) return window.supabase;
  await import('https://cdn.jsdelivr.net/npm/@supabase/supabase-js/+esm');
  window.supabase = supabase.createClient(ADMIN_CONFIG.SUPABASE_URL, ADMIN_CONFIG.SUPABASE_ANON_KEY);
  return window.supabase;
}

async function login(e){
  e.preventDefault();
  const email = document.getElementById('email').value;
  const pass = document.getElementById('password').value;
  const sb = await loadSupabase();
  const { user, error } = await sb.auth.signInWithPassword({email, password: pass});
  if(error){alert('Login error: '+error.message);return}
  document.getElementById('auth-area').classList.add('hidden');
  document.getElementById('admin-ui').classList.remove('hidden');
  loadAdminData();
}

async function loadAdminData(){
  const sb = await loadSupabase();
  // fetch simple stats (demo placeholders)
  document.getElementById('admin-stats').innerHTML = '<div>Photos: 0 | Memories: 0 | Events: 0 | News: 0</div>';
}

async function uploadFiles(files){
  // unsigned Cloudinary direct upload
  const cloud = ADMIN_CONFIG.CLOUDINARY_CLOUD_NAME;
  const preset = ADMIN_CONFIG.CLOUDINARY_UPLOAD_PRESET;
  const status = document.getElementById('upload-status');
  status.innerHTML = '';
  for(const f of files){
    const fd = new FormData();
    fd.append('file', f);
    fd.append('upload_preset', preset);
    const url = `https://api.cloudinary.com/v1_1/${cloud}/upload`;
    const res = await fetch(url,{method:'POST',body:fd});
    const data = await res.json();
    const p = document.createElement('div');p.textContent = `${f.name} → uploaded`;
    status.appendChild(p);
    // TODO: save data.secure_url into Supabase photos table via client
  }
}

function wireAdmin(){
  document.getElementById('login-form').addEventListener('submit',login);
  document.getElementById('photo-input').addEventListener('change',(e)=>uploadFiles(e.target.files));
  document.getElementById('mem-add').addEventListener('click',async function(e){e.preventDefault();alert('Memory added (demo)');});
}

window.addEventListener('DOMContentLoaded',wireAdmin);