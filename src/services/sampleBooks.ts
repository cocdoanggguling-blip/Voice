import JSZip from 'jszip';
import coverSenjaUrl from '../assets/images/cover_senja_nusantara_1794673355074.jpg';
import coverJejakUrl from '../assets/images/cover_jejak_aksara_1794673356539.jpg';
import { parseEpubMetadata } from './epubService';
import { hasSeededSamples, markSamplesSeeded, saveBook } from './storageService';

interface SampleBookSpec {
  id: string;
  title: string;
  author: string;
  language: string;
  coverAssetUrl: string;
  chapters: Array<{ title: string; paragraphs: string[] }>;
}

const SAMPLE_SPECS: SampleBookSpec[] = [
  {
    id: 'sample_senja_nusantara',
    title: 'Senja di Pelabuhan Nusantara',
    author: 'Raka Pradipta',
    language: 'id',
    coverAssetUrl: coverSenjaUrl,
    chapters: [
      {
        title: 'Bab 1: Mercusuar dan Angin Timur',
        paragraphs: [
          'Langit di atas pelabuhan tua itu berubah menjadi tembaga hangat, sementara perahu-perahu kayu mulai merapat ke dermaga batu.',
          'Nara berdiri di ujung anjungan, memegang buku catatan bersampul kulit yang tepinya sudah melengkung karena garam laut; di seberangnya, menara mercusuar mulai memancarkan cahaya pertama.',
          '"Apakah kapal dari timur sudah terlihat di garis cakrawala?" tanya Nara kepada penjaga pelabuhan yang sedang menggulung tali tambat.',
          'Penjaga itu menengadah sejenak, memandang ombak yang datang beriringan dengan tenang, lalu tersenyum tipis. "Sebentar lagi, Nak; angin sore ini bersahabat, jadi layar mereka pasti melaju lebih cepat."',
          'Di antara bunyi tiang layar yang berderit dan suara burung camar yang pulang ke tebing karang, Nara membuka halaman pertama catatannya dan mulai menuliskan kisah tentang kota pesisir yang tak pernah tidur.',
        ],
      },
      {
        title: 'Bab 2: Peta di Balik Laci Kayu',
        paragraphs: [
          'Keesokan paginya, kabut tipis masih menggantung di atas atap gudang rempah, membuat jalan setapak menuju pasar ikan tampak seperti lukisan cat air.',
          'Di ruang arsip pelabuhan, Nara menemukan sebuah laci kayu jati yang terkunci rapat; setelah kunci kuningan diputar perlahan, aroma cengkih kering dan kertas tua langsung memenuhi ruangan.',
          'Di dalamnya tersimpan tiga lembar peta laut abad kesembilan belas, lengkap dengan catatan pinggir bertinta cokelat, garis arus musiman, serta nama-nama teluk kecil yang kini hampir terlupakan.',
          'Setiap garis pada peta itu seakan menyimpan suara para pelaut masa lampau, mengingatkan Nara bahwa setiap perjalanan panjang selalu dimulai dari keberanian membaca tanda-tanda kecil di sekitar kita.',
        ],
      },
      {
        title: 'Bab 3: Layar Terkembang Menuju Fajar',
        paragraphs: [
          'Menjelang tengah malam, lonceng pelabuhan berdentang tiga kali; para awak kapal mulai menyiapkan lentera badai dan memeriksa kompas kuningan di ruang kemudi.',
          'Nara melangkah ke geladak utama sambil memeluk tas kanvasnya. "Kita berangkat sebelum matahari terbit, supaya arus pasang membantu kapal keluar dari selat," ujar nakhoda dengan suara mantap.',
          'Ketika jangkar diangkat dan haluan membelah air yang memantulkan cahaya bintang, Nara merasakan ketenangan yang jarang ia temui di daratan—sebuah awal baru yang terbuka luas di hadapannya.',
        ],
      },
    ],
  },
  {
    id: 'sample_paper_cartographer',
    title: 'The Paper Cartographer',
    author: 'Clara Vance',
    language: 'en',
    coverAssetUrl: coverJejakUrl,
    chapters: [
      {
        title: 'Chapter 1: The Quiet Conservatory',
        paragraphs: [
          'Rain tapped gently against the tall glass panes of the botanical conservatory, blurring the city lights into soft streaks of gold and slate.',
          'Inside, Julian spread an unfinished sheet of cotton paper across the oak table; beside his brass compass lay dried fern leaves, ink bottles, and a pocket dictionary with worn corners.',
          '"Do you really believe an invisible river runs beneath the old library?" asked Elena, leaning closer to inspect the delicate contour lines.',
          'Julian dipped his nib into walnut ink, paused for a breath, and drew a faint curve near the northern margin. "Every city keeps older maps beneath its streets; you only have to listen to where the water gathers."',
        ],
      },
      {
        title: 'Chapter 2: Folding the Horizon',
        paragraphs: [
          'By morning, the storm had cleared, leaving crisp air and bright reflections across the stone courtyard.',
          'Elena unfolded the parchment carefully, noticing how each crease aligned with a forgotten staircase, an arched bridge, and a courtyard fountain carved from pale limestone.',
          'Together they stepped onto the quiet avenue, ready to verify whether ink and curiosity could still uncover wonders hidden in plain sight.',
        ],
      },
    ],
  },
];

function escapeXml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

async function fetchAssetBytes(url: string): Promise<Uint8Array | null> {
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    return new Uint8Array(await res.arrayBuffer());
  } catch {
    return null;
  }
}

async function buildValidEpubBuffer(spec: SampleBookSpec): Promise<ArrayBuffer> {
  const zip = new JSZip();

  // EPUB requires uncompressed mimetype first
  zip.file('mimetype', 'application/epub+zip', { compression: 'STORE' });

  zip.folder('META-INF')?.file(
    'container.xml',
    `<?xml version="1.0" encoding="UTF-8"?>
<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
  <rootfiles>
    <rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/>
  </rootfiles>
</container>`
  );

  const oebps = zip.folder('OEBPS');
  if (!oebps) throw new Error('Failed to create OEBPS directory');

  const coverBytes = await fetchAssetBytes(spec.coverAssetUrl);
  if (coverBytes) {
    oebps.file('images/cover.jpg', coverBytes);
  }

  const manifestItems: string[] = [
    '<item id="ncx" href="toc.ncx" media-type="application/x-dtbncx+xml"/>',
    '<item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/>',
  ];
  if (coverBytes) {
    manifestItems.push(
      '<item id="cover-image" href="images/cover.jpg" media-type="image/jpeg" properties="cover-image"/>'
    );
  }

  const spineRefs: string[] = [];
  const navLinks: string[] = [];
  const ncxPoints: string[] = [];

  spec.chapters.forEach((ch, idx) => {
    const fileName = `chapter_${idx + 1}.xhtml`;
    const id = `chap_${idx + 1}`;
    manifestItems.push(`<item id="${id}" href="${fileName}" media-type="application/xhtml+xml"/>`);
    spineRefs.push(`<itemref idref="${id}"/>`);
    navLinks.push(`<li><a href="${fileName}">${escapeXml(ch.title)}</a></li>`);
    ncxPoints.push(
      `<navPoint id="navPoint-${idx + 1}" playOrder="${idx + 1}">
        <navLabel><text>${escapeXml(ch.title)}</text></navLabel>
        <content src="${fileName}"/>
      </navPoint>`
    );

    const pTags = ch.paragraphs.map((p) => `    <p>${escapeXml(p)}</p>`).join('\n');
    oebps.file(
      fileName,
      `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml" xml:lang="${spec.language}">
  <head>
    <title>${escapeXml(ch.title)}</title>
  </head>
  <body>
    <h1>${escapeXml(ch.title)}</h1>
${pTags}
  </body>
</html>`
    );
  });

  oebps.file(
    'nav.xhtml',
    `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops">
  <head><title>Daftar Isi</title></head>
  <body>
    <nav epub:type="toc" id="toc">
      <h1>Daftar Isi</h1>
      <ol>
        ${navLinks.join('\n        ')}
      </ol>
    </nav>
  </body>
</html>`
  );

  oebps.file(
    'toc.ncx',
    `<?xml version="1.0" encoding="UTF-8"?>
<ncx xmlns="http://www.daisy.org/z3986/2005/ncx/" version="2005-1">
  <head>
    <meta name="dtb:uid" content="urn:uuid:${spec.id}"/>
  </head>
  <docTitle><text>${escapeXml(spec.title)}</text></docTitle>
  <navMap>
    ${ncxPoints.join('\n    ')}
  </navMap>
</ncx>`
  );

  oebps.file(
    'content.opf',
    `<?xml version="1.0" encoding="UTF-8"?>
<package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="BookId">
  <metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
    <dc:identifier id="BookId">urn:uuid:${spec.id}</dc:identifier>
    <dc:title>${escapeXml(spec.title)}</dc:title>
    <dc:creator>${escapeXml(spec.author)}</dc:creator>
    <dc:language>${spec.language}</dc:language>
    ${coverBytes ? '<meta name="cover" content="cover-image"/>' : ''}
  </metadata>
  <manifest>
    ${manifestItems.join('\n    ')}
  </manifest>
  <spine toc="ncx">
    ${spineRefs.join('\n    ')}
  </spine>
</package>`
  );

  return zip.generateAsync({ type: 'arraybuffer' });
}

export async function ensureSampleBooksSeeded(): Promise<void> {
  if (hasSeededSamples()) return;

  for (const spec of SAMPLE_SPECS) {
    try {
      const buffer = await buildValidEpubBuffer(spec);
      const metadata = await parseEpubMetadata(buffer, `${spec.title}.epub`, spec.id, true);
      // Ensure reliable cover even if epubjs blob read fails in restricted environments
      if (!metadata.coverDataUrl) {
        metadata.coverDataUrl = spec.coverAssetUrl;
      }
      await saveBook(metadata, buffer);
    } catch (err) {
      console.warn('Gagal menyiapkan buku contoh:', spec.title, err);
    }
  }

  markSamplesSeeded();
}
