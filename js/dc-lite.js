/*
 * dc-lite: motor mínimo que dibuja la plantilla de la página con Preact.
 * Lee el <template id="dc-tpl"> y lo convierte en elementos, resolviendo
 * {{valor}}, <sc-for list as> y <sc-if value> con lo que devuelve renderVals().
 */
(function () {
  var P = window.preact;
  var h = P.h;
  var RX = /\{\{\s*([\w.$]+)\s*\}\}/g;
  var ONE = /^\{\{\s*([\w.$]+)\s*\}\}$/;

  function lookup(path, scopes) {
    var parts = path.split('.');
    for (var i = scopes.length - 1; i >= 0; i--) {
      var s = scopes[i];
      if (s && Object.prototype.hasOwnProperty.call(s, parts[0])) {
        var v = s[parts[0]];
        for (var j = 1; j < parts.length && v != null; j++) v = v[parts[j]];
        return v;
      }
    }
    return undefined;
  }
  function value(str, scopes) {
    var m = str.match(ONE);
    if (m) return lookup(m[1], scopes);
    return str.replace(RX, function (_, p) { var v = lookup(p, scopes); return v == null ? '' : String(v); });
  }

  // Compila el DOM de la plantilla a funciones (una sola vez).
  function compile(node, inSvg) {
    if (node.nodeType === 3) {
      var t = node.nodeValue;
      if (!t.trim()) return /\n/.test(t) ? null : function () { return ' '; };
      if (t.indexOf('{{') < 0) return function () { return t; };
      return function (sc) { return value(t, sc); };
    }
    if (node.nodeType !== 1) return null;
    var tag = node.tagName.toLowerCase();
    if (tag === 'helmet') return null;
    // Las tablas se guardan como x-table, x-tr... para que el parser no las reordene.
    if (/^x-(table|thead|tbody|tfoot|tr|td|th)$/.test(tag)) tag = tag.slice(2);
    var svg = inSvg || tag === 'svg';
    var kids = compileChildren(node, svg && tag !== 'foreignobject');

    if (tag === 'sc-for') {
      var listExpr = node.getAttribute('list') || '';
      var as = node.getAttribute('as') || 'item';
      return function (sc) {
        var list = value(listExpr, sc) || [];
        var out = [];
        for (var i = 0; i < list.length; i++) {
          var o = {}; o[as] = list[i]; o[as + 'Index'] = i;
          out.push(h(P.Fragment, { key: i }, render(kids, sc.concat([o]))));
        }
        return out;
      };
    }
    if (tag === 'sc-if') {
      var cond = node.getAttribute('value') || '';
      return function (sc) { return value(cond, sc) ? render(kids, sc) : null; };
    }

    var attrs = [];
    var isTextInput = tag === 'input' && !/^(range|checkbox|radio)$/i.test(node.getAttribute('type') || '');
    for (var a = 0; a < node.attributes.length; a++) {
      var at = node.attributes[a];
      var name = at.name;
      if (name.indexOf('hint-') === 0) continue;
      // Los nombres de evento vienen en minúsculas desde el parser: onclick -> onClick
      if (/^on[a-z]/.test(name)) {
        name = 'on' + name.charAt(2).toUpperCase() + name.slice(3);
        name = name.replace(/^onTimeupdate$/, 'onTimeUpdate').replace(/^onLoadedmetadata$/, 'onLoadedMetadata')
          .replace(/^onMouseenter$/, 'onMouseEnter').replace(/^onMouseleave$/, 'onMouseLeave')
          .replace(/^onMousemove$/, 'onMouseMove').replace(/^onKeydown$/, 'onKeyDown');
        if (isTextInput && name === 'onChange') name = 'onInput';
      }
      if (svg) name = svgAttr(node, at.name, name);
      attrs.push([name, at.value]);
    }
    return function (sc) {
      var props = {};
      for (var k = 0; k < attrs.length; k++) {
        var v = attrs[k][1].indexOf('{{') >= 0 ? value(attrs[k][1], sc) : attrs[k][1];
        if (v === undefined) continue;
        props[attrs[k][0]] = v;
      }
      return h(tag, props, render(kids, sc));
    };
  }
  // Conserva mayúsculas de atributos SVG (viewBox) que el parser HTML ya respeta en SVG.
  function svgAttr(node, raw, name) { return name; }

  function compileChildren(node, svg) {
    var src = node.tagName && node.tagName.toLowerCase() === 'template' ? node.content.childNodes : node.childNodes;
    var out = [];
    for (var i = 0; i < src.length; i++) { var c = compile(src[i], svg); if (c) out.push(c); }
    return out;
  }
  function render(kids, sc) {
    var out = [];
    for (var i = 0; i < kids.length; i++) out.push(kids[i](sc));
    return out;
  }

  // Clase base compatible con la que usa el código de la página.
  function DCLogic(props) { P.Component.call(this, props); }
  DCLogic.prototype = Object.create(P.Component.prototype);
  DCLogic.prototype.constructor = DCLogic;
  DCLogic.prototype.render = function () {
    var vals = this.renderVals ? this.renderVals() : {};
    return h(P.Fragment, null, render(DCLogic.tree, [vals]));
  };
  window.DCLogic = DCLogic;

  window.dcMount = function (Component, mountEl) {
    var tpl = document.getElementById('dc-tpl');
    DCLogic.tree = compileChildren(tpl, false);
    P.render(h(Component, {}), mountEl);
  };
})();
