// Embed icon + version metadata into the Windows exe using pure-JS resedit
// (lets us build on Linux/macOS without Wine/rcedit).
const fs = require('fs');
const path = require('path');

exports.default = async function afterPack(context) {
  if (context.electronPlatformName !== 'win32') return;
  const ResEdit = await import('resedit');
  const { NtExecutable, NtExecutableResource, Resource, Data } = ResEdit;

  const appInfo = context.packager.appInfo;
  const exePath = path.join(context.appOutDir, `${appInfo.productFilename}.exe`);
  const exe = NtExecutable.from(fs.readFileSync(exePath));
  const res = NtExecutableResource.from(exe);

  const iconFile = Data.IconFile.from(fs.readFileSync(path.join(__dirname, '..', 'build', 'icon.ico')));
  const existing = Resource.IconGroupEntry.fromEntries(res.entries);
  const groupId = existing.length ? existing[0].id : 1;
  const lang = existing.length ? existing[0].lang : 1033;
  Resource.IconGroupEntry.replaceIconsForResource(res.entries, groupId, lang, iconFile.icons.map(i => i.data));

  const versions = Resource.VersionInfo.fromEntries(res.entries);
  const vi = versions[0] || Resource.VersionInfo.createEmpty();
  const [maj, min, pat] = appInfo.version.split('.').map(Number);
  vi.setFileVersion(maj, min, pat, 0, 1033);
  vi.setProductVersion(maj, min, pat, 0, 1033);
  vi.setStringValues({ lang: 1033, codepage: 1200 }, {
    FileDescription: 'EVE Toolkit',
    ProductName: 'EVE Toolkit',
    CompanyName: 'Mr Frank',
    LegalCopyright: `© ${new Date().getFullYear()} Mr Frank. EVE Online © CCP hf.`,
    OriginalFilename: `${appInfo.productFilename}.exe`,
    InternalName: 'EVE Toolkit',
    FileVersion: appInfo.version,
    ProductVersion: appInfo.version
  });
  vi.outputToResourceEntries(res.entries);

  res.outputResource(exe);
  fs.writeFileSync(exePath, Buffer.from(exe.generate()));
  console.log('  • embedded icon and version info into', path.basename(exePath));
};
