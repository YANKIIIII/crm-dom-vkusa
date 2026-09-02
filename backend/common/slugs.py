import re
import string

_TRANSLIT = {
    'а': 'a', 'б': 'b', 'в': 'v', 'г': 'g', 'д': 'd', 'е': 'e', 'ё': 'e',
    'ж': 'zh', 'з': 'z', 'и': 'i', 'й': 'i', 'к': 'k', 'л': 'l', 'м': 'm',
    'н': 'n', 'о': 'o', 'п': 'p', 'р': 'r', 'с': 's', 'т': 't', 'у': 'u',
    'ф': 'f', 'х': 'h', 'ц': 'c', 'ч': 'ch', 'ш': 'sh', 'щ': 'sch', 'ъ': '',
    'ы': 'y', 'ь': '', 'э': 'e', 'ю': 'yu', 'я': 'ya',
}


def slug_from_name(name, *, fallback='item', max_length=32):
    chars = []
    for char in (name or '').strip().lower():
        if char in _TRANSLIT:
            chars.append(_TRANSLIT[char])
        elif char.isascii() and char.isalnum():
            chars.append(char)
        elif char in ' -_':
            chars.append('_')
    slug = re.sub(r'_+', '_', ''.join(chars)).strip('_')
    if not slug:
        slug = fallback
    if not slug[0].isalpha():
        slug = f'{fallback}_{slug}'
    return slug[:max_length].rstrip('_') or fallback


def unique_slug(name, exists, *, fallback='item', max_length=32):
    base = slug_from_name(name, fallback=fallback, max_length=max_length)
    candidate = base
    index = 2
    while exists(candidate):
        suffix = f'_{index}'
        candidate = f'{base[:max_length - len(suffix)]}{suffix}'
        index += 1
    return candidate


def next_letter_code(used):
    used = {str(code).upper() for code in used}
    for letter in string.ascii_uppercase:
        if letter not in used:
            return letter
    for first in string.ascii_uppercase:
        for second in string.ascii_uppercase:
            code = f'{first}{second}'
            if code not in used:
                return code
    raise ValueError('Не осталось свободных кодов.')
