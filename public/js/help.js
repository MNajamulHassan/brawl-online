import { MODES, WEAPONS, VERSION, REPO_URL } from '/shared/constants.js';
import { SKILLS } from '/shared/balance.js';
import { bindLabel, moveLabel } from './settings.js';
import { esc, openModal, closeModal } from './ui.js';

/** Every piece of help text is built from the player's current binds, never hard-coded keys. */
const $ = (s) => document.querySelector(s);

/** [action, PC keys, touch control] rows used by the HUD hint, the lobby card and How to play. */
export function controlRows(binds) {
  const k = (a) => bindLabel(binds, a);
  return [
    ['Move', ['up', 'left', 'down', 'right'].map(k).join(', '), 'Left thumb stick'],
    ['Aim', 'Mouse', 'Right thumb stick'],
    ['Shoot', k('shoot'), 'Push the right stick past the red ring (or the Fire button)'],
    ['Swap weapon', k('swap'), 'Swap button'],
    ['Use skill', k('ability'), 'Skill button'],
    ['Pick skill card', `${k('pick1')} / ${k('pick2')} / ${k('pick3')}`, 'Tap a card'],
    ['Scoreboard', k('scoreboard'), 'Scores button'],
    ['Mute', k('mute'), 'Settings → Audio'],
    ['Settings / menu', k('menu'), 'Gear button'],
  ];
}

export function renderHelp(binds) {
  const k = (a) => bindLabel(binds, a).split(' / ')[0];
  $('#help').textContent = `${moveLabel(binds)} move · mouse aim · ${k('shoot')} shoot · ${k('swap')} swap · ${k('ability')} skill · `
    + `${k('pick1')}/${k('pick2')}/${k('pick3')} pick · ${k('scoreboard')} scores · ${k('menu')} menu`;
  $('#bSwap').textContent = `Swap (${k('swap')})`;
  const card = $('#controlsKeys');
  card.innerHTML = [['Move', moveLabel(binds)], ['Fire', k('shoot')], ['Swap', k('swap')], ['Skill', k('ability')], ['Menu', k('menu')], ['Scores', k('scoreboard')]]
    .map(([label, key]) => `<kbd>${esc(key)}</kbd><span>${label}</span>`).join('');
}

export function openHowTo(binds, touch) {
  const rows = controlRows(binds);
  $('#howBody').innerHTML = `
    <h3>Controls${touch ? ' (touch)' : ''}</h3>
    <table class="how">${rows.map(([a, pc, t]) => `<tr><td>${esc(a)}</td><td>${esc(touch ? t : pc)}</td></tr>`).join('')}</table>
    <p class="set-hint">Change keys in Settings → Controls.</p>
    <h3>Weapons</h3>
    <table class="how">${Object.values(WEAPONS).map((w) => `<tr><td>${esc(w.name)}</td><td>${w.mag ? `${w.mag} ${w.grenade ? "throws" : "shots"}, map pickup` : 'Infinite, always with you'}${w.pel ? ` · ${w.pel} pellets` : ''}${w.rad ? ' · explodes' : ''}</td></tr>`).join('')}</table>
    <h3>Modes</h3>
    <table class="how">${Object.values(MODES).map((m) => `<tr><td>${esc(m.name)}</td><td>${m.coop ? 'Co-op against waves of bots. Revive downed friends.' : m.teams ? `Red vs Blue, first to ${m.scoreLimit}. Revive downed teammates.` : `Free for all, first to ${m.scoreLimit}.`}</td></tr>`).join('')}</table>
    <h3>Levels and skills</h3>
    <p>Damage, kills, crates and XP orbs give XP. Every level offers 3 skill cards (${Object.keys(SKILLS).length} skills in total): passives, weapon mods and actives on ${esc(bindLabel(binds, 'ability'))}. Skills reset each round.</p>`;
  openModal($('#howto'));
}

export function openAbout() {
  $('#aboutBody').innerHTML = `
    <p><b>Maze Brawl</b> · version ${esc(VERSION)}</p>
    <p>A cross-platform multiplayer top-down shooter with an authoritative Node.js server. Made as a software engineering project.</p>
    <p>Code and documentation: <a href="${REPO_URL}" target="_blank" rel="noopener noreferrer">${esc(REPO_URL.replace('https://', ''))}</a></p>
    <p class="set-hint">Built with Node.js, Express, Socket.IO and HTML5 Canvas. Sounds and music are synthesised in the browser. Fonts: Russo One and Rubik (Google Fonts). MIT licence.</p>`;
  openModal($('#about'));
}

export function initHelpDialogs() {
  for (const id of ['howto', 'about']) $(`#${id} .close`).addEventListener('click', () => closeModal($(`#${id}`)));
}
