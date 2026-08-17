// anim.js - PPTX 动画注入模块（exportPPTX 云函数内部使用）
// 原理：pptxgenjs 不支持动画，本模块在其生成的 .pptx（本质是 zip）上做后处理，
// 向每页 XML 注入：① 页面切换淡入动画（slide transition）；② 标题/要点形状的入场淡入动画（entrance fade）。
// 注入失败绝不抛出（try-catch 全兜底），保证导出功能永远可用。

const JSZip = require('jszip')

const NS_P = 'xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"'
const NS_P14 = 'xmlns:p14="http://schemas.microsoft.com/office/powerpoint/2010/main"'

// ① 幻灯片切换动画（淡入，700ms）
function buildTransitionXML() {
  return '<mc:AlternateContent xmlns:mc="http://schemas.openxmlformats.org/markup-compatibility/2006">' +
    '<mc:Choice ' + NS_P14 + ' Requires="p14">' +
    '<p:transition ' + NS_P + ' spd="med" p14:dur="700"><p:fade/></p:transition>' +
    '</mc:Choice>' +
    '<mc:Fallback>' +
    '<p:transition ' + NS_P + ' spd="med"><p:fade/></p:transition>' +
    '</mc:Fallback>' +
    '</mc:AlternateContent>'
}

// ② 入场动画 timing 块：每个形状依次自动淡入（首元素随页出现，其余自动接续）
function buildTimingXML(spids, durMs, delayMs) {
  let id = 1
  const nextId = () => ++id
  const rootId = nextId()
  const seqId = nextId()
  const mainSeqId = nextId()

  // 每个形状一段「预设动画10=淡入」+「可见性设置」
  const parBlocks = spids.map((spid, i) => {
    const parId = nextId()       // afterEffect 层
    const innerParId = nextId()  // 中间层
    const effectId = nextId()    // clickEffect 实际动画
    const setDurId = nextId()
    const animDurId = nextId()
    return '<p:par>' +
      '<p:cTn id="' + parId + '" fill="hold" nodeType="afterEffect">' +
      '<p:stCondLst><p:cond delay="0"/></p:stCondLst>' +
      '<p:childTnLst>' +
      '<p:par>' +
      '<p:cTn id="' + innerParId + '" fill="hold">' +
      '<p:stCondLst><p:cond delay="' + (i === 0 ? 0 : delayMs) + '"/></p:stCondLst>' +
      '<p:childTnLst>' +
      '<p:par>' +
      '<p:cTn id="' + effectId + '" presetID="10" presetClass="entr" presetSubtype="0" fill="hold" nodeType="afterEffect">' +
      '<p:stCondLst><p:cond delay="0"/></p:stCondLst>' +
      '<p:childTnLst>' +
      '<p:set>' +
      '<p:cBhvr>' +
      '<p:cTn id="' + setDurId + '" dur="1" fill="hold">' +
      '<p:stCondLst><p:cond delay="0"/></p:stCondLst>' +
      '</p:cTn>' +
      '<p:tgtEl><p:spTgt spid="' + spid + '"/></p:tgtEl>' +
      '<p:attrNameLst><p:attrName>style.visibility</p:attrName></p:attrNameLst>' +
      '</p:cBhvr>' +
      '<p:to><p:strVal val="visible"/></p:to>' +
      '</p:set>' +
      '<p:animEffect transition="in" filter="fade">' +
      '<p:cBhvr>' +
      '<p:cTn id="' + animDurId + '" dur="' + durMs + '"/>' +
      '<p:tgtEl><p:spTgt spid="' + spid + '"/></p:tgtEl>' +
      '</p:cBhvr>' +
      '</p:animEffect>' +
      '</p:childTnLst>' +
      '</p:cTn>' +
      '</p:par>' +
      '</p:childTnLst>' +
      '</p:cTn>' +
      '</p:par>' +
      '</p:childTnLst>' +
      '</p:cTn>' +
      '</p:par>'
  }).join('')

  return '<p:timing>' +
    '<p:tnLst>' +
    '<p:par>' +
    '<p:cTn id="' + rootId + '" dur="indefinite" restart="never" nodeType="tmRoot">' +
    '<p:childTnLst>' +
    '<p:seq concurrent="1" nextAc="seek">' +
    '<p:cTn id="' + seqId + '" dur="indefinite" nodeType="mainSeq">' +
    '<p:childTnLst>' +
    parBlocks +
    '</p:childTnLst>' +
    '</p:cTn>' +
    '</p:seq>' +
    '</p:childTnLst>' +
    '</p:cTn>' +
    '</p:par>' +
    '</p:tnLst>' +
    '</p:timing>'
}

// 收集当前页所有形状 id（按出现顺序）
function collectSpids(xml) {
  const ids = []
  const re = /<p:cNvPr[^>]*\sid="(\d+)"/g
  let m
  while ((m = re.exec(xml)) !== null) {
    ids.push(m[1])
  }
  return ids
}

/**
 * 对 pptxgenjs 生成的 PPTX buffer 注入动画
 * @param {Buffer} pptxBuffer 原始 pptx 二进制
 * @returns {Promise<Buffer>} 注入后的 pptx 二进制（失败时返回原 buffer）
 */
async function injectAnimations(pptxBuffer) {
  try {
    const zip = await JSZip.loadAsync(pptxBuffer)
    const slideFiles = Object.keys(zip.files).filter(f => /^ppt\/slides\/slide\d+\.xml$/.test(f))
    for (const f of slideFiles) {
      const xml = await zip.file(f).async('string')
      const spids = collectSpids(xml)
      let next = xml
      // 先注入切换动画，再注入入场动画（顺序保证 transition 在 timing 之前）
      next = next.replace('</p:sld>', buildTransitionXML() + '</p:sld>')
      if (spids.length) {
        next = next.replace('</p:sld>', buildTimingXML(spids, 400, 200) + '</p:sld>')
      }
      zip.file(f, next)
    }
    return await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' })
  } catch (e) {
    // 动画注入失败时退回原始文件，绝不影响导出主流程
    console.error('动画注入失败，已退回无动画版本', e)
    return pptxBuffer
  }
}

module.exports = { injectAnimations }
