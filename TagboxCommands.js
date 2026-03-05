// ==UserScript==
// @name         Tagbox Commands
// @namespace    http://tampermonkey.net/
// @version      0.1
// @description  Alias and remove commands for e621
// @author       Waydence
// @icon         https://cdn.jsdelivr.net/gh/WaydenceMullins/TagboxCommands@main/icon64.png
// @match        https://e621.net/*
// @match        https://e926.net/*
// @match        https://e6ai.net/*
// @grant        GM_addStyle
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_registerMenuCommand
// ==/UserScript==

let tagTextareas;
let allAliasRules = [];

const currentSite = window.location;
const currentCssLink = document.head.querySelector('link[href^="/users/custom_style.css"]');
const csrfToken = document.head.children["csrf-token"].attributes.content.value;

let tcConfig = {};
const defaultTcConfig = {
  "keybind": " ",
  "runOnEvent": "keyup",
  "invChr": "!",
  "addChr": "+",
  "rmChr": "-",
  "normChr": "",
  "sortChr": "abc",
  "sortgroupChr": "abcg",
  "wildcardChr": "*",
  "cssAliasesEnabled": false,
  "cssAliasesCache": "",
  "cssMd5": "",
  "savedAliases": "#basic alias\nloatvi -> looking_at_viewer\n\n#alias with multiple antecedents\nthrquavie\nthquvi tqv -> three-quarter_view\n\n#partial alias\nbro > brown_\n\n#alias with substitution\n*.pen* -> $1_penetrating_$2"
};

function ParseAliases(string){
  return string.replace(/\s*;\s*|\n\n/g,"\n") // ; to newline, multiple newlines to single
    .replace(/(?<=^|\n)\s*#+.*\n|\n\s*#+.*$|\s*#+.*|(?<=^|\n)\s+|\s+(?=->|>|=|,)|(?<=>|=|,)\s+|\s*(?=\n|$)/g,"") // remove comments, spaces (before each definition, before and after arrows, after each definition)
    .replace(/(?<!(>|=).+)\n|  /g," ") // newlines in multiline rules and multi-spaces to a single space
    .replace(/(?<= |>)-(?!>)/g,tcConfig.rmChr) // - to rm character
    .split("\n")
    .map(rule=>{ return {"antcd": RegExp.escape(rule.split(/->|>/)[0]).replace(re_wildcard,"(\\S+)").split("\\x20"), "consq": rule.split(/->|>/)[1], "partial": !/->/.test(rule)}; });
}

function ResetConfig(){
  GM_setValue("tcConfig", defaultTcConfig);
  tcConfig = GM_getValue("tcConfig", null);
}

let invChrEsc,addChrEsc,rmChrEsc,normChrEsc,re_wildcard,sortChrEsc,sortgroupChrEsc,re_sorteither,re_findRmChr,re_findNoRmChr,re_invRmChr,fn_invRmChr,cmdCaptGroups,re_findGroupToSort,re_tagsWithRmCmd

function RefreshConfig(){
  invChrEsc = RegExp.escape(tcConfig.invChr);
  addChrEsc = RegExp.escape(tcConfig.addChr);
  rmChrEsc = RegExp.escape(tcConfig.rmChr);
  normChrEsc = RegExp.escape(tcConfig.normChr);
  re_wildcard = new RegExp(`\\\\${RegExp.escape(tcConfig.wildcardChr)}`,"g");

  sortChrEsc = RegExp.escape(tcConfig.sortChr);
  sortgroupChrEsc = RegExp.escape(tcConfig.sortgroupChr);
  re_sorteither = new RegExp(`(?<!\S)(${sortgroupChrEsc}|${sortChrEsc})(?!\S)`,"g");

  re_findRmChr = new RegExp(`(?<=^| )${rmChrEsc}`,"g");

  re_findNoRmChr = new RegExp(`(?<=^| )(?=[^${rmChrEsc}])`,"g");

  re_invRmChr = new RegExp(`(?<=^| )${rmChrEsc}(\\S+)|(?<=^| )(\\S+)`,"g"); // tag with rm command goes into first capturing group with the command removed, tag without goes into the second
  fn_invRmChr = (unused,hadRm,needsRm)=>hadRm?hadRm:`${tcConfig.rmChr}${needsRm}`; // function returns tag without rm command if it had one, and with one if it didn't

  cmdCaptGroups = `(?:(?<inv>${invChrEsc})|(?<add>${addChrEsc})|(?<rm>${rmChrEsc})|(?<norm>${normChrEsc}))`;

  re_findGroupToSort = new RegExp(`(?<=\n|^)(?:(.*${sortgroupChrEsc}.*)|.*${sortChrEsc}.*)(?=\n|$)`,"g");

  re_tagsWithRmCmd = new RegExp(`(?<=(?<!\\S)${rmChrEsc})\\S+`,"g");

  allAliasRules = [];

  if (/\S+ *> *\S+/.test(tcConfig.savedAliases)){
    allAliasRules = ParseAliases(tcConfig.savedAliases);
  }

  if (/\*al\*[\s\S]+>[\s\S]+\*al\*/.test(decodeURI(currentSite.search))){
    allAliasRules = allAliasRules.concat(ParseAliases(decodeURIComponent(currentSite.search).split("*al*")[1]));
  }

  if (tcConfig.cssAliasesEnabled && currentCssLink){
    if (tcConfig.cssMd5 == currentCssLink.attributes.href.value){
      allAliasRules = allAliasRules.concat(ParseAliases(tcConfig.cssAliasesCache));
    }
    else {
      let request = new XMLHttpRequest();
      request.open("GET", `https://${currentSite.hostname}${currentCssLink.attributes.href.value}`);
      request.onreadystatechange = ()=>{
        if (request.readyState === 4 && request.status === 200 && /\*al\*[\s\S]+>[\s\S]+\*al\*/.test(request.responseText)){
          tcConfig.cssAliasesCache = request.responseText.split("*al*")[1];
          tcConfig.cssMd5 = currentCssLink.attributes.href.value;
          allAliasRules = allAliasRules.concat(ParseAliases(tcConfig.cssAliasesCache));
          GM_setValue("tcConfig", tcConfig);
        }
        else if (request.readyState === 4 && request.status !== 200){
          console.error("Failed to load user CSS, status:", request.status);
        }
        else if (request.readyState === 4){
          console.log("Could not find aliases in user CSS");
        }
      }
      request.send();
    }
  }
  allAliasRules.reverse();
}

function SliceByCaret(element){return [element.value.slice(0, element.selectionStart), element.value.slice(element.selectionStart)];} // to keep track of text cursor position

let currentlyPoking = false;
function PokeTagBox(element){ // send events to trigger updates of tag preview and tag counter
  if (currentlyPoking){return;}
  currentlyPoking = true;
  ["keyup","input"].forEach(event=>element.dispatchEvent(new Event(event)));
  currentlyPoking = false;
}

function GetCombinedTagString(){return Array.from(tagTextareas).map(tagTextarea=>tagTextarea.value).join(" ");} // splice all tag boxes together

function RemoveFoundTags(tagsToRm){
  tagTextareas.forEach(tagTextarea=>{
    let tagStringHalves = SliceByCaret(tagTextarea).map(half=>{
      return half.replace(new RegExp(`(?<!\\S)(${tagsToRm.join("|")}|${rmChrEsc}\\S+)(( +|$|(?=\\n)))`,"g"),"")
    });
    tagTextarea.value = tagStringHalves.join("");
    tagTextarea.selectionStart = tagTextarea.selectionEnd = tagStringHalves[0].length;
    PokeTagBox(tagTextarea);
  });
}

function RemoveTags(){
  let combinedTagString = GetCombinedTagString();

  let tagsToRm = combinedTagString.match(re_tagsWithRmCmd); // step 1: get a list of tags with rm command, with the command character removed, and remove them immediately

  if (!tagsToRm){return;}

  tagsToRm.forEach((tag,index)=>{
    if (tag.includes(tcConfig.wildcardChr)){ // if tag has a wildcard, find matching tags and add it to the list
      let wildcardMatches = combinedTagString.match(new RegExp(`(?<!\\S)${RegExp.escape(tag).replace(re_wildcard,"\\S+")}(?!\\S)`,"g"));
      if (wildcardMatches){ tagsToRm = tagsToRm.concat(wildcardMatches); }
    }
  });

  RemoveFoundTags(tagsToRm.map(tag=>RegExp.escape(tag))); // execute step 1

  let request = new XMLHttpRequest(); // step 2: send the list + tag box contents to preview API and get aliases/implications, then remove them too
  request.open("POST", `https://${currentSite.hostname}/tags/preview.json`);
  request.setRequestHeader("X-CSRF-Token", csrfToken);
  request.setRequestHeader("Content-Type", "application/x-www-form-urlencoded; charset=UTF-8");
  request.onreadystatechange = ()=>{
    if (request.readyState === 4 && request.status === 200){
      let tagsToRmSet = new Set(tagsToRm); // convert to a set to avoid duplication and infinite loop

      JSON.parse(request.response).forEach(responseTag=>{
        if (responseTag.alias){
          if (tagsToRmSet.has(responseTag.name)){ tagsToRmSet.add(responseTag.alias); }
          if (tagsToRmSet.has(responseTag.alias)){ tagsToRmSet.add(responseTag.name); }
        }
        if (responseTag.implies){
          responseTag.implies.forEach(implication=>{
            if (tagsToRmSet.has(implication)){
              tagsToRmSet.add(responseTag.name);
              tagsToRmSet.add(responseTag.alias);
            }
          });
        }
      });

      tagsToRmSet.delete(undefined);

      RemoveFoundTags(Array.from(tagsToRmSet).map(tag=>RegExp.escape(tag))); // execute step 2
    }
    else if (request.readyState === 4 && request.status !== 200){
      console.error("Alias/implication request failed with status", request.status);
    }
  }
  request.send(`tags=${tagsToRm.join("+")}+${GetCombinedTagString().replace(/\s+/g,"+")}`);
}

function ReplaceSortTags(event){
  if (event.key === tcConfig.keybind || tcConfig.runOnEvent === "input"){
    if (allAliasRules.length > 0){
      let tagStringHalves = SliceByCaret(this);

      allAliasRules.forEach(rule=>{

        let antcdJoined = rule.antcd.join("|");

        tagStringHalves = tagStringHalves.map(half=>{

          // find tag to replace, put it into <tag> capturing group, and its command into corresponding <inv>,<add>,<rm> or <norm> group
          return half.replace(new RegExp(`(?<!\\S)${cmdCaptGroups}(?<tag>${antcdJoined})${rule.partial?"\\s*$":"(?!\\S)"}`,"g"), (...parameteres)=>{

            let match = parameteres[parameteres.length - 1]; // last parameter is an object with capture group names as keys and matches as values

            match.tag = match.tag.replace(new RegExp(`^(${antcdJoined})$`, "g"), rule.consq); // perform substitution

            // execute a command if it is found
            if (match.inv){ match.tag = match.tag.replace(re_invRmChr, fn_invRmChr); }
            if (match.add){ match.tag = match.tag.replace(re_findRmChr, ""); }
            if (match.rm){ match.tag = match.tag.replace(re_findNoRmChr, tcConfig.rmChr); }

            return match.tag;
          });
        });
      });

      let caretPosition = tagStringHalves[0].length;

      let tagString = tagStringHalves.join("").replace(re_findGroupToSort, (group,sortGroupCmdFound,offset)=>{

        group = group.replace(re_sorteither,"").split(" ").sort()
          .map((tag,index,array)=>{return sortGroupCmdFound && index!=0 && tag[0]!=array[index-1][0] ? "\n"+tag : tag;})
          .join(" ").trim();

        caretPosition = group.length + offset; // move text cursor to the end of sorted group

        return group;
      });

      this.value = tagString;

      this.selectionStart = this.selectionEnd = caretPosition;

      PokeTagBox(this);
    }
    RemoveTags() // now process remove
  }

  event.key === "Enter" || event.key === "Tab" && RemoveTags(); // call remove on autocomplete keys
}

const RefreshTagboxElements = function(event){
  if (event.animationName === "tagFieldAdded"){

    // all fields with autocomplete get processed for sort, replace, and remove on keybind
    document.querySelectorAll("[data-autocomplete^='tag']").forEach(field=>{
      field.removeEventListener("keyup", ReplaceSortTags);
      field.removeEventListener("input", ReplaceSortTags);
      field.addEventListener(tcConfig.runOnEvent, ReplaceSortTags);
    });

    // additionally, remove is processed when autocomplete is clicked, as well as on autocomplete keys (tab/enter)
    document.querySelectorAll(".ui-autocomplete-dropdown").forEach(dropdown=>{
      dropdown.removeEventListener("click", RemoveTags);
      dropdown.addEventListener("click", RemoveTags);
    });

    // used by remove to only process tag boxes, not search fields
    tagTextareas = document.querySelectorAll(".tag-textarea");
  }
}

function OpenSettingsDialog(){
  settingsDialog.className = "TCS_dialog visible";
  tcConfig.keybind===" " ? settingsDialog.TCS_keybind.innerText="Space" : settingsDialog.TCS_keybind.innerText=tcConfig.keybind;
  settingsDialog.TCS_invChr.value = tcConfig.invChr;
  settingsDialog.TCS_addChr.value = tcConfig.addChr;
  settingsDialog.TCS_rmChr.value = tcConfig.rmChr;
  settingsDialog.TCS_normChr.value = tcConfig.normChr;
  settingsDialog.TCS_sortChr.value = tcConfig.sortChr;
  settingsDialog.TCS_sortgroupChr.value = tcConfig.sortgroupChr;
  settingsDialog.TCS_wildcardChr.value = tcConfig.wildcardChr;
  tcConfig.runOnEvent==="input" ? settingsDialog.TCS_runOnEvent.checked=true : settingsDialog.TCS_runOnEvent.checked=false;
  tcConfig.cssAliasesEnabled ? settingsDialog.TCS_cssAliasesEnabled.checked=true : settingsDialog.TCS_cssAliasesEnabled.checked=false;
  settingsDialog.TCS_savedAliases.value = tcConfig.savedAliases;
}

function SaveSettings(){
  settingsDialog.TCS_keybind.innerText==="Space" ? tcConfig.keybind=" " : tcConfig.keybind=settingsDialog.TCS_keybind.innerText;
  settingsDialog.TCS_invChr.value==="" ? tcConfig.invChr=defaultTcConfig.invChr : tcConfig.invChr=settingsDialog.TCS_invChr.value;
  settingsDialog.TCS_addChr.value==="" ? tcConfig.addChr=defaultTcConfig.addChr : tcConfig.addChr=settingsDialog.TCS_addChr.value;
  settingsDialog.TCS_rmChr.value==="" ? tcConfig.rmChr=defaultTcConfig.rmChr : tcConfig.rmChr=settingsDialog.TCS_rmChr.value;
  settingsDialog.TCS_normChr.value==="" ? tcConfig.normChr=defaultTcConfig.normChr : tcConfig.normChr=settingsDialog.TCS_normChr.value;
  settingsDialog.TCS_sortChr.value==="" ? tcConfig.sortChr=defaultTcConfig.sortChr : tcConfig.sortChr=settingsDialog.TCS_sortChr.value;
  settingsDialog.TCS_sortgroupChr.value==="" ? tcConfig.sortgroupChr=defaultTcConfig.sortgroupChr : tcConfig.sortgroupChr=settingsDialog.TCS_sortgroupChr.value;
  settingsDialog.TCS_wildcardChr.value==="" ? tcConfig.wildcardChr=defaultTcConfig.wildcardChr : tcConfig.wildcardChr=settingsDialog.TCS_wildcardChr.value;
  settingsDialog.TCS_runOnEvent.checked ? tcConfig.runOnEvent="input" : tcConfig.runOnEvent="keyup";
  settingsDialog.TCS_cssAliasesEnabled.checked ? tcConfig.cssAliasesEnabled=true : tcConfig.cssAliasesEnabled=false;
  tcConfig.savedAliases = settingsDialog.TCS_savedAliases.value;
  GM_setValue("tcConfig", tcConfig);
  RefreshConfig();
}

function SetKeybind(){
  settingsDialog.TCS_keybind.className = "waiting";
  settingsDialog.TCS_keybind.innerText = "...";
  document.addEventListener('keydown', event=>{
    settingsDialog.TCS_keybind.className = "";
    if (event.key === " " || event.key === "Escape"){settingsDialog.TCS_keybind.innerText = "Space";}
    else {settingsDialog.TCS_keybind.innerText = event.key;}
    settingsDialog.TCS_keybind.blur();
  }, {once: true});
}

tcConfig = GM_getValue("tcConfig", null);
if (!tcConfig){ResetConfig()}
RefreshConfig();

GM_addStyle(`@keyframes tagFieldAdded {from {opacity: 0.99} to {opacity: 1}} [data-autocomplete^='tag'] {animation: tagFieldAdded 0.001s}
.TCS_dialog {
box-sizing: border-box;
display: none;
grid-template: "sidebar_a TCS_savedAliases" min-content "sidebar_b TCS_savedAliases" auto;
grid-template-columns: min-content auto;
column-gap: .5rem;
position: fixed;
z-index: 250;
inset:0;
margin: auto;
width: 95vw;
max-width: 60rem;
height: 95vh;
padding: .5rem;
background: var(--color-section, cornflowerblue);
color: var(--color-text, white);
border: 1px solid var(--color-section-darken-5, black);
border-radius: .25rem;
box-shadow: 0 0 .5rem -1px var(--color-background, black);

.sidebar_a {
grid-area: sidebar_a;
border-radius: .25rem .25rem 0 0;
padding: .5rem;
background: var(--color-section-lighten-5, steelblue);
display: grid;
grid: min-content / min-content 6rem;
grid-auto-rows: min-content;
gap: .5rem .5rem;
input {max-width: 3rem}
#TCS_sortChr, #TCS_sortgroupChr {max-width: unset}
input[type="checkbox"] {margin-right: .2rem}
label:not(.twoColumns) {text-align: right};
label[for="TCS_runOnEvent"] {text-decoration: underline dotted 1px}
#TCS_keybind {border-radius: .25rem}
.waiting {background-color: var(--palette-background-gold, orange)}
.twoColumns {grid-column: 1 / span 2}
}

.sidebar_b {
grid-area: sidebar_b;
border-radius: 0 0 .25rem .25rem;
padding: .5rem  .5rem 0;
overflow: auto;
background: var(--color-section-lighten-5, steelblue);
display: flex;
flex-direction: column;
#TCS_reset {width: 100%; margin: 3vh 0}
.text {flex: 1}
.buttons {display: flex; gap: .25rem; position: sticky; bottom: 0; background: var(--color-section-lighten-5, steelblue); padding-bottom: .5rem;
#TCS_save, #TCS_close {border-radius: .25rem; padding: .2rem .6rem; font-size: 130%}
#TCS_save {flex: 1}
}
}

#TCS_savedAliases {grid-area: TCS_savedAliases; border-radius: .25rem; resize: none; padding: 2px .5rem}

@media (max-width: 50rem) {
overflow: auto;
width: 100vw;
height: 100vh;
font-size: 95%;
border-radius: 0;
grid-template: "sidebar_a sidebar_b" min-content "TCS_savedAliases TCS_savedAliases" auto;
grid-template-columns: auto auto;
padding: .25rem;
gap: .25rem;
.sidebar_a, .sidebar_b {border-radius: .25rem; padding: .5rem .25rem}
.sidebar_a {grid: min-content / min-content 5rem; padding-top: 2rem}
.sidebar_b {padding-bottom: 0; #TCS_reset {margin: 1.5rem 0} #TCS_save, #TCS_close {padding: .1rem .3rem; font-size: 120%}}
#TCS_savedAliases {height: 90vh; padding: 2px .25rem}
}
}
.TCS_dialog.visible {display: grid}
`);

document.body.children.page.addEventListener("animationstart", RefreshTagboxElements, false); // detect CSS animation when element is added and refresh relevant elements

GM_registerMenuCommand("Settings", OpenSettingsDialog);

let settingsDialog = document.body.appendChild(document.createElement("div"));
settingsDialog.className = "TCS_dialog";
let TCS_runOnEventTitle = "Replaces when a charecter is entered into the tag filed rather than on keybind press";
settingsDialog.innerHTML += `
<div class="sidebar_a">
<label for="TCS_keybind">Keybind</label><button id="TCS_keybind"></button>
<label for="TCS_invChr">Invert</label><input id="TCS_invChr" type="text" placeholder="${defaultTcConfig.invChr}">
<label for="TCS_addChr">Add</label><input id="TCS_addChr" type="text" placeholder="${defaultTcConfig.addChr}">
<label for="TCS_rmChr">Remove*</label><input id="TCS_rmChr" type="text" placeholder="${defaultTcConfig.rmChr}">
<label for="TCS_normChr">Normal</label><input id="TCS_normChr" type="text" placeholder="${defaultTcConfig.normChr}">
<label for="TCS_sortChr">Sort</label><input id="TCS_sortChr" type="text" placeholder="${defaultTcConfig.sortChr}">
<label for="TCS_sortgroupChr">Sort&group</label><input id="TCS_sortgroupChr" type="text" placeholder="${defaultTcConfig.sortgroupChr}">
<label for="TCS_wildcardChr">Wildcard*</label><input id="TCS_wildcardChr" type="text" placeholder="${defaultTcConfig.wildcardChr}">
<label for="TCS_runOnEvent" title="${TCS_runOnEventTitle}" class="twoColumns"><input id="TCS_runOnEvent" type="checkbox">Run on every input</label>
<label for="TCS_cssAliasesEnabled" class="twoColumns"><input id="TCS_cssAliasesEnabled" type="checkbox">Load aliases from CSS</label>
</div>
<div class="sidebar_b">
<button id="TCS_reset">Reset settings</button>
<div class="text"><b>*</b>Only in tag fields<br><br><a href="https://github.com/WaydenceMullins/TagboxCommands">Github/Manual</a><br><br><a href="https://e621.net/forum_topics/62454">Forum thread</a></div>
<div class="buttons"><button id="TCS_save">Save</button><button id="TCS_close">Close</button></div>
</div>
<textarea id="TCS_savedAliases"></textarea>
`;
document.querySelectorAll('[id^="TCS_"]').forEach(item=>{settingsDialog[item.id] = item;});
settingsDialog.TCS_keybind.addEventListener("click", SetKeybind);
settingsDialog.TCS_reset.addEventListener("click", ()=>{ if (confirm("Are you sure? This will delete all alias definitions")){ResetConfig();OpenSettingsDialog();} });
settingsDialog.TCS_save.addEventListener("click", SaveSettings);
settingsDialog.TCS_close.addEventListener("click", ()=>{settingsDialog.className = "TCS_dialog";});
document.addEventListener('keydown', event=>{ if (event.key==="Escape"){settingsDialog.className="TCS_dialog";} }, {once: true});
