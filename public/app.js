const $=id=>document.getElementById(id);
let setupMode=false;
async function api(path, body) {
 const r=await fetch("/api"+path,{method:body===undefined?"GET":"POST",headers:body===undefined?{}:{"Content-Type":"application/json"},credentials:"same-origin",body:body===undefined?undefined:JSON.stringify(body)});
 const data=await r.json().catch(()=>({error:"Unexpected server response"}));
 if(!r.ok) throw new Error(data.error||"Request failed"); return data;
}
function showMessage(id,text){$(id).textContent=text||""}
function hide(el,on=true){el.classList.toggle("hidden",on)}
function addBubble(who,text){const d=document.createElement("div");d.className="bubble "+who;d.textContent=text;$("chatLog").appendChild(d);d.scrollIntoView({block:"nearest"});}
async function init(){
 try {const status=await api("/setup/status");setupMode=status.setupRequired;hide($("nameWrap"),!setupMode);$("authTitle").textContent=setupMode?"Set up the owner account":"Welcome back";$("authHint").textContent=setupMode?"This can only be done once on an empty database.":"Sign in to VP Construction Jarves";$("authSubmit").textContent=setupMode?"Create owner account":"Sign in";$("password").autocomplete=setupMode?"new-password":"current-password";try{await api("/me");enterWorkspace()}catch{}}
 catch(e){showMessage("authMessage","Server or database unavailable. Check deployment logs and DATABASE_URL.");}
}
function enterWorkspace(){hide($("auth"));hide($("workspace"),false);hide($("logout"),false);loadProjects()}
$("authForm").addEventListener("submit",async e=>{e.preventDefault();showMessage("authMessage","");try{const d=await api(setupMode?"/setup":"/login",{name:$("name").value,email:$("email").value,password:$("password").value});enterWorkspace();showMessage("authMessage",d.user?"Signed in.":"")}catch(err){showMessage("authMessage",err.message)}});
$("logout").addEventListener("click",async()=>{try{await api("/logout",{})}finally{hide($("workspace"));hide($("auth"),false);hide($("logout"));$("password").value=""}});
async function loadProjects(){try{const d=await api("/projects");$("projects").replaceChildren();if(!d.projects.length){$("projects").textContent="No projects yet.";return}for(const p of d.projects){const el=document.createElement("article");el.className="project";const title=document.createElement("b");title.textContent=p.name;const meta=document.createElement("p");meta.textContent=[p.client,p.location,p.area_sqft?Number(p.area_sqft).toLocaleString()+" sq.ft.":null,p.status].filter(Boolean).join(" · ");el.append(title,meta);$("projects").append(el)}}catch(e){showMessage("authMessage",e.message)}}
$("projectForm").addEventListener("submit",async e=>{e.preventDefault();try{await api("/projects",{name:$("projectName").value,client:$("clientName").value,location:$("location").value,area_sqft:$("area").value});e.target.reset();loadProjects()}catch(err){alert(err.message)}});
$("chatForm").addEventListener("submit",async e=>{e.preventDefault();const message=$("question").value;addBubble("user",message);$("question").value="";try{const d=await api("/chat",{message});addBubble("jarves",d.reply)}catch(err){addBubble("jarves","Unable to answer: "+err.message)}});
init();
