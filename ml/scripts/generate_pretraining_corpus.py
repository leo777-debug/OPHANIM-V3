"""Unlabelled, synthetic domain text for continued causal language modelling.

This corpus teaches vocabulary and document structure, never current facts.
It does not consume uploads, shared factual snapshots, or supervised targets.
"""
import argparse
import hashlib
import json
from collections import Counter
from pathlib import Path
from model_store import root, inside


PASSAGES = {
    'logistics': {
        'en': [
            'An air waybill identifies a shipment and its routing. A missing field remains unknown. Gross weight and chargeable weight can differ. Compare the source documents before explaining a discrepancy.',
            'A packing list describes packages and contents. An invoice describes commercial values. Quantities must be compared using compatible units. A mismatch is a review flag, not proof of fraud.',
            'A delay email may contain an estimated arrival, a requested action and a deadline. Preserve the time zone and distinguish an estimate from a confirmed milestone. A booking does not prove departure.',
            'A bill of lading may name a shipper, consignee, vessel and container. Preserve references as written, including leading zeros. OCR can confuse O with zero and I with one; uncertain readings require review.',
            'A delivery order authorises a cargo release under its stated conditions. Free time, cutoff times and charges depend on a dated source. Do not infer a current rule from an old contract.',
            'A table header defines the meaning and units of its rows. Keep the heading, page and row references together. An empty cell is not a zero. Cite the source when answering a shipment question.',
        ],
        'ar': [
            'تحدد بوليصة الشحن الجوي الشحنة ومسارها. يبقى الحقل المفقود غير معروف. قد يختلف الوزن الإجمالي عن الوزن المحتسب. يجب مقارنة المستندات قبل شرح أي اختلاف.',
            'تصف قائمة التعبئة الطرود ومحتوياتها، وتصف الفاتورة القيم التجارية. تقارن الكميات بوحدات متوافقة. الاختلاف إشارة للمراجعة ولا يثبت الاحتيال.',
            'قد تحتوي رسالة التأخير على موعد وصول تقديري وإجراء مطلوب وموعد نهائي. يجب حفظ المنطقة الزمنية والتمييز بين التقدير والحدث المؤكد. الحجز لا يثبت المغادرة.',
            'قد تتضمن بوليصة الشحن اسم الشاحن والمرسل إليه والسفينة والحاوية. تحفظ المراجع كما وردت بما فيها الأصفار الأولى. القراءة غير الواضحة تحتاج إلى مراجعة.',
            'يسمح أمر التسليم بالإفراج عن البضاعة وفق شروطه. تعتمد فترة السماح والمواعيد والرسوم على مصدر مؤرخ. لا تستنتج قاعدة حالية من عقد قديم.',
            'يحدد عنوان الجدول معنى الصفوف ووحداتها. تحفظ مراجع العنوان والصفحة والصف مع النص. الخلية الفارغة ليست صفراً. يجب الاستشهاد بالمصدر عند الإجابة.',
        ],
    },
    'general': {
        'en': [
            'An incident report separates observed facts from allegations. Identify the place and reporting time. A disruption may affect logistics, but a port closure requires its own dated evidence.',
            'Several reports may describe the same event with different timestamps. Attribute each statement and record corrections. Repetition of a claim does not make independent confirmation.',
            'A cautious forecast states a time horizon, assumptions and uncertainty. Historical comparisons are retrieved evidence, not a promise. Explain which new observations would change the outlook.',
            'A claim about an airport can refer to a terminal, runway or the whole airport. Parse the scope and time window before checking evidence. Missing observations mean unknown, not false.',
            'A personal watch describes places, routes, dates and topics. Do not infer private information about individuals. Warnings support awareness; they do not make decisions for the reader.',
            'A disaster record describes coordinates, start and end times, severity and source links. A geographic match alone does not establish transport impact. Distinguish confirmed closures from reported delays.',
        ],
        'ar': [
            'يفصل تقرير الحادث الوقائع المرصودة عن الادعاءات. يحدد المكان ووقت التقرير. قد يؤثر الاضطراب على النقل، لكن إغلاق الميناء يحتاج إلى دليل مؤرخ خاص به.',
            'قد تصف تقارير متعددة الحدث نفسه بأوقات مختلفة. ينسب كل تصريح إلى مصدره وتحفظ التصحيحات. تكرار الادعاء لا يعني تأكيده من مصدر مستقل.',
            'يحدد التوقع الحذر الأفق الزمني والافتراضات وعدم اليقين. المقارنات التاريخية أدلة مسترجعة وليست وعداً. يجب بيان المعلومات الجديدة التي قد تغير التوقع.',
            'قد يتعلق ادعاء عن مطار بصالة أو مدرج أو المطار كله. يحدد نطاق الادعاء والفترة الزمنية قبل التحقق. غياب الملاحظات يعني أن النتيجة غير معروفة.',
            'تصف المتابعة الشخصية الأماكن والمسارات والتواريخ والموضوعات. لا تستنتج معلومات خاصة عن الأفراد. تدعم التنبيهات الوعي ولا تتخذ قرارات نيابة عن القارئ.',
            'يصف سجل الكارثة الإحداثيات ووقت البداية والنهاية والشدة وروابط المصادر. التطابق الجغرافي وحده لا يثبت التأثير على النقل. يميز الإغلاق المؤكد عن التأخير المبلغ عنه.',
        ],
    },
}


def generate(folder, train_per_group=200, holdout_per_group=20):
    folder = Path(folder)
    if folder.exists() and any(folder.iterdir()):
        raise RuntimeError('Corpus version exists; do not overwrite it')
    folder.mkdir(parents=True, exist_ok=True)
    summary = {'method': 'continued_pretraining', 'objective': 'next-token prediction on every non-padding token',
               'source': 'synthetic-template', 'licence': 'MIT', 'customer_data': False, 'teacher': None, 'splits': {}}
    hashes = set()
    for split, count in (('train', train_per_group), ('validation', holdout_per_group), ('test', holdout_per_group)):
        rows = []
        for mode in ('logistics', 'general'):
            for language in ('en', 'ar', 'mixed'):
                for i in range(count):
                    # Unique fictional records avoid copied examples across splits.
                    reference = f'SYNTHETIC-{split}-{mode}-{language}-{i:06d}'
                    english = PASSAGES[mode]['en'][i % 6]
                    arabic = PASSAGES[mode]['ar'][i % 6]
                    body = english if language == 'en' else arabic if language == 'ar' else english + '\n' + arabic
                    quantity = 10 + i % 91
                    if language == 'ar':
                        record = f'مثال خيالي: المرجع {reference}، العدد {quantity}، الصفحة {1+i%8}. الحالة غير مؤكدة. لا توجد قاعدة حالية أو واقعة حقيقية في هذا المثال.'
                    else:
                        record = f'Fictional practice record {reference}: quantity {quantity}; page {1+i%8}; status unconfirmed. This example contains no current rule or real event.'
                    text = f'[mode: {mode}][task: domain_reading]\n{body}\n{record}'
                    digest = hashlib.sha256(text.encode()).hexdigest()
                    if digest in hashes:
                        raise RuntimeError('Duplicate corpus passage')
                    hashes.add(digest)
                    rows.append({'id': reference, 'text': text, 'content_hash': digest, 'split': split,
                                 'mode': mode, 'language': language, 'source': 'synthetic-template', 'licence': 'MIT', 'customer_data': False})
        (folder / f'{split}.jsonl').write_text(''.join(json.dumps(r, ensure_ascii=False) + '\n' for r in rows), encoding='utf-8')
        summary['splits'][split] = {'documents': len(rows), 'characters': sum(len(r['text']) for r in rows),
                                    'languages': dict(Counter(r['language'] for r in rows)), 'modes': dict(Counter(r['mode'] for r in rows))}
    summary['limitations'] = ['Small repetitive synthetic starter corpus; scale and diversify before a production run.',
                              'No new factual knowledge or measured model improvement is claimed.']
    (folder / 'corpus_card.json').write_text(json.dumps(summary, ensure_ascii=False, indent=2), encoding='utf-8')
    return summary


if __name__ == '__main__':
    p = argparse.ArgumentParser()
    p.add_argument('--version', required=True)
    p.add_argument('--train-per-group', type=int, default=200)
    p.add_argument('--holdout-per-group', type=int, default=20)
    args = p.parse_args()
    if args.train_per_group < 1 or args.holdout_per_group < 1:
        raise ValueError('Each split needs examples')
    store = root(20 * 1024**2)
    print(json.dumps(generate(inside(store, f'corpora/{args.version}'), args.train_per_group, args.holdout_per_group), indent=2))
