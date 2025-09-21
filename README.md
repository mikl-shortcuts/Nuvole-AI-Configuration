# Nuvole AI Configuration

Here All text elements for **[Nuvole AI](https://routinehub.co/shortcut/18431/)** translated into different languages are stored.

## How to make changes to the translation for Nuvole AI?

### Guide:

1. Fork this repository;
2. Make changes to file with translations (`dictionaries/language-code.json`):
  - Translate what is in `value` into the language that names the file;
  - Change or check on corrections what is translated by AI (`"translatedBy": "ai"`). At the same time, changing `translatedBy` to the value of `human`;
  - Translate only what you know and are 100% sure of. The original version of the element is shown in `original.value`.
3. Once you have translated and corrected all the translations of the elements, make a contribute by opening a pull request.

### Examples:

#### 1. Bad translation (fixing):

**Old**:
```
"History_T_2Chats": {
    "value": "22 chats", // Bad translation from AI (not matches with original.value)
    "original": {
      "value": "2 chats"
    },
    "translatedBy": "ai",
    "isTranslated": true
  }
```

**New**:
```
"History_T_2Chats": {
    "value": " 2 chats", // 4 chats -> 2 chats
    "original": {
      "value": "2 chats"
    },
    "translatedBy": "human", // ai -> human
    "isTranslated": true
  }
```

There are changes in the values of `value` and `translatedBy`, as the translation has been changed.

#### 2. Excellent translation (checking):

**Old**:
```
"History_T_2Chats": {
    "value": "2 chats", // Good translation from AI
    "original": {
      "value": "2 chats"
    },
    "translatedBy": "ai",
    "isTranslated": true
  }
```

**New**:
```
"History_T_2Chats": {
    "value": " 2 chats",
    "original": {
      "value": "2 chats"
    },
    "translatedBy": "human", // ai -> human
    "isTranslated": true
  }
```

There are change in the value of `translatedBy`, as the translation has been checked by a person and it is perfect.

## Additional information

It will be indicated about the help with the translation of Nuvole AI, with a link to your GitHub account and to RoutineHub, if there is a link to it in your GitHub profile.

JSON with text objects will be updated in Nuvole AI with new versions.