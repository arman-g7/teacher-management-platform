import Markdown from 'react-markdown';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
export function Rich({ value }: { value: string }) {
  return (
    <div className="prose">
      <Markdown
        skipHtml
        remarkPlugins={[remarkMath]}
        rehypePlugins={[[rehypeKatex, { trust: false, strict: 'ignore' }]]}
        disallowedElements={['img', 'a']}
        unwrapDisallowed
      >
        {value}
      </Markdown>
    </div>
  );
}
export function Attachment({ id, image = false }: { id: string; image?: boolean }) {
  return image ? (
    <img className="attachment-image" src={'/api/files/' + id} alt="تصویر سؤال" />
  ) : (
    <a className="text-link" href={'/api/files/' + id} target="_blank" rel="noreferrer">
      دریافت پیوست
    </a>
  );
}
