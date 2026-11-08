const fs = require('fs');
const path = require('path');
const { Resvg } = require('@resvg/resvg-js');
const pngToIco = require('png-to-ico').default || require('png-to-ico');
(async () => {
  const dir = path.join(__dirname, '..', 'build');
  const svg = fs.readFileSync(path.join(dir, 'icon.svg'));
  const render = s => new Resvg(svg, { fitTo: { mode: 'width', value: s } }).render().asPng();
  fs.writeFileSync(path.join(dir, 'icon.png'), render(256));
  const sizes = [16, 24, 32, 48, 64, 128, 256].map(render);
  fs.writeFileSync(path.join(dir, 'icon.ico'), await pngToIco(sizes));
  console.log('icons written');
})();
