# Error recovery for MicroXML

This specification defines a way to parse any sequence of characters into a generalization of the MicroXML data model. The generalization is that there are no restrictions on the characters that can occur in names or in data.

Parsing is divided in two consecutive phases: tokenization and tree building. Information is passed from the tokenization phase to the tree building phase as a sequence of  _abstract tokens_. Abstract tokens are named in CamelCase and each token may have associated data, which is a string.  The following abstract tokens are defined:

+ DataChar - associated data is a string containing exactly one code point
+ StartTagOpen - associated data is a string (the name of the element)
+ StartTagClose
+ EmptyElementTagClose 
+ EndTag - associated data is a string (the name of the element)
+ AttributeName - associated data is a string (the name of the attribute)

The tokenization and tree building phase have quite different characteristics.
+ The tokenization phase does not make use of information about the document type. However, the tree building phase may optionally make use of information about the document type (eg a schema). This specification defines a way of performing the tree building phase that does not make any use of schema information.  It is also possible to define tree building phases that are specific to a particular document type (eg HTML), or that make use of information from a particular kind of schema (eg RELAX NG).  (Note that RELAX NG can be considered as a grammar over abstract tokens.) However, this specification at the moment only defines a document-type independent tree building phase.
+ The tokenization phase is designed to allow for a streaming implementation, whereas the tree-building phase is not.
+ The tokenization phase works equally well for parsing document fragments.

## Tokenization

The input to the tokenization phase is a sequence of characters. The output of the tokenization phase is a sequence of abstract tokens that matches the following regular expression:

    ((StartTagOpen (AttributeName DataChar*)* (EmptyElementTagClose|StartTagClose))
     | DataChar
     | EndTag)*

Before the main part of the tokenization phase, the sequence of characters is preprocessed as follows:
+ if the first character is a Byte Order Mark (#xFEFF), it is removed;
+ newlines are normalized by replacing any #xD character or #xD/#xA character sequence, by a #xA character.
     
### Lexical tokens

The tokenization phase works by dividing up the input into _lexical tokens_. Lexical tokens are named in UPPER_CASE. Each lexical token has an associated regular grammar, and may also have a trailing context (lookahead) also specified by a regular grammar. The following defines the possible lexical tokens and their grammars using the same notation as the MicroXML spec. The trailing context is specified using a `/` operator: `X / Y` matches `X` but only when it is followed by `Y`.

A lexical token whose production below is prefixed by a `*` has associated data, which is a substring of the token. Parentheses on the right hand side (possibly within referenced productions) identify the substring (parentheses in the trailing context are ignored for this purpose).

    CHAR ::= [#x0-#x10FFFF]
    *DATA_CHAR ::= (CHAR)
    *START_TAG_OPEN ::= "<" (NAME) / TAG_CONTEXT
    *ATTRIBUTE_NAME_EQUALS ::= S* (NAME) S* "="
    *BOOLEAN_ATTRIBUTE = S* (NAME) / TAG_CONTEXT
    START_TAG_CLOSE ::= ">"
    EMPTY_ELEMENT_TAG_CLOSE ::= "/>"
    *END_TAG ::= "</" (NAME) S* ">"
    TAG_CONTEXT ::= (S+ NAME)* S* (START_TAG_CLOSE | EMPTY_ELEMENT_TAG_CLOSE | S NAME S* "=")
    NAME ::= NAME_START_CHAR NAME_CHAR*
    NAME_START_CHAR ::= [A-Za-z_:$] | [#x80-#x10FFFF]
    NAME_CHAR ::= NAME_START_CHAR | [0-9] | "-" | "."
    *NAMED_CHAR_REF ::= "&" (NAME) ";"
    *NUMERIC_CHAR_REF ::= "&#" ("x" [0-9a-fA-F]+ | [0-9]+) ";"
    S ::= #x9 | #xA | #xC | #x20
    SINGLE_QUOTE ::= "'"
    DOUBLE_QUOTE ::= '"'
    *ATTRIBUTE_VALUE_CHAR ::= (CHAR - [<>])
    *ANGLE_SINGLE ::= ([<>]) / (CHAR - "'")* "'" (S | ">" | "/>")
    *ANGLE_DOUBLE ::= ([<>]) / (CHAR - "'")* "'" (S | ">" | "/>")
    PI ::= "<?" (CHAR* - (CHAR* "?>" CHAR*)) "?>"
    COMMENT ::= "<!--" (CHAR* - (CHAR* "-->" CHAR*)) "-->"
    CDATA_OPEN ::= "<![CDATA["
    CDATA_CLOSE ::= "]]>"
    EMPTY ::= ""
    DOCTYPE_OPEN ::= "<!" [Dd] [Oo] [Cc] [Tt] [Yy] [Pp] [Ee]
    LITERAL ::= '"' (CHAR - '"')* '"' | "'" (CHAR - "'")* "'"
    DECL_CHAR ::= CHAR - ("[" | "]" | "<" | ">" | '"'| "'")
    DECL ::= "<!" (DECL_CHAR | LITERAL)* ">"
    SUBSET_OPEN ::= "["
    SUBSET_CLOSE ::= "]" S* ">";

There are a number of different named tokenization modes.  Each tokenization mode specifies

+ a set of lexical tokens that are recognized in that mode,
+ rules for mapping each recognized lexical token to zero or more abstract tokens, and
+ rules for when to change to another tokenization mode.

The state of the tokenization process consists of
+ the current tokenization mode
+ the current input (a sequence of code-points)

A step in the tokenization process consists of the following.
+ Recognizing the next lexical token. This consists of finding the longest initial subsequence of the input that matches one of the lexical tokens recognized in the current tokenization mode. Any trailing context is not considered as part of the match. It is possible for there to be two choices for the longest matching token (eg S and DATA_CHAR in UnquoteAttributeValue mode): in this case, the choice that is neither DATA_CHAR nor ATTRIBUTE_VALUE_CHAR must be recognized.
+ Emitting zero or more abstract tokens according to the rules for that lexical token in that tokenization mode.
+ Possibly changing to another tokenization mode according to the rules for that lexical token in that tokenization mode.
+ Changing the current input to be the sequence of characters following the token.

The tokenization process starts with Main as the current tokenization mode, and the input to the tokenization process as the current input, and repeats the tokenization step until the current input is empty. At this point, if the current tokenization mode is one of Tag, StartAttributeValue, UnquoteAttributeValue, SingleQuoteAttributeValue or DoubleQuoteAttributeValue, then a StartTagClose abstract token is emitted.

### Default handling rules

This section defines default handling rules for certain lexical tokens, which are used in the definition of various tokenization modes.

+ DATA_CHAR - emit a DataChar token
+ ATTRIBUTE_VALUE_CHAR - emit a DataChar token
+ NAMED_CHAR_REF - if the associated string is a valid character name emit a single DataChar, otherwise emit a DataChar for each character in the NAMED_CHAR_REF 
+ NUMERIC_CHAR_REF - if the string starts with "x", then let _n_ be the result of treating the part of the string following the "x" as a hexadecimal number, otherwise let _n_ be the result of treating the string as a decimal number; if _n_ is <= #x10FFFF emit a single DataChar whose associated data is a string containing a character with code-point _n_, otherwise emit a DataChar for each character in the NUMERIC_CHAR_REF (ie for `&#` followed by the associated string followed by `;`)
+ DECIMAL_CHAR_REF
+ START_TAG_CLOSE - emit a StartTagClose token and change to Main mode
+ EMPTY_ELEMENT_TAG_CLOSE - emit an EmptyElementTagClose token and change to Main mode

### Tokenization modes

This section defines the available tokenization modes.  The only tokens that are recognized in each mode are those that are explicitly mentioned in each mode.

The data associated with a lexical token is also by default associated with any abstract token that is emitted in the processing of the lexical token and that has associated data.

#### Main

+ DATA_CHAR, NAMED_CHAR_REF, NUMERIC_CHAR_REF - default handling
+ START_TAG_OPEN - emit a StartTagOpen token and change to Tag mode
+ END_TAG - emit an EndTag token
+ CDATA_OPEN - change to CData mode
+ COMMENT, PI - do nothing
+ DOCTYPE_OPEN - change to Doctype mode

#### Tag

+ ATTRIBUTE_NAME_EQUALS - emit an AttributeName token and change to StartAttributeValue mode
+ BOOLEAN_ATTRIBUTE - emit an AttributeName token
+ EMPTY - emit a StartTagClose and change to Main mode
+ START_TAG_CLOSE, EMPTY_ELEMENT_TAG_CLOSE - default handling
+ S - do nothing

#### StartAttributeValue

+ S - do nothing
+ SINGLE_QUOTE - change to SingleQuoteAttributeValue mode
+ DOUBLE_QUOTE - change to DoubleQuoteAttributeValue mode
+ EMPTY - change to UnquoteAttributeValue mode
+ START_TAG_CLOSE, EMPTY_ELEMENT_TAG_CLOSE - default handling

#### UnquoteAttributeValue

+ DATA_CHAR, NAMED_CHAR_REF, NUMERIC_CHAR_REF, START_TAG_CLOSE, EMPTY_ELEMENT_TAG_CLOSE - default handling
+ S - change to Tag mode

#### SingleQuoteAttributeValue

+ ATTRIBUTE_VALUE_CHAR, NAMED_CHAR_REF, NUMERIC_CHAR_REF - default handling
+ ANGLE_SINGLE - emit a DataChar token
+ SINGLE_QUOTE, EMPTY - change to Tag mode

#### DoubleQuoteAttributeValue

+ ATTRIBUTE_VALUE_CHAR, NAMED_CHAR_REF, NUMERIC_CHAR_REF - default handling
+ ANGLE_DOUBLE - emit a DataChar token
+ DOUBLE_QUOTE, EMPTY - change to Tag mode

#### CData

+ DATA_CHAR - default handling
+ CDATA_CLOSE - change to Main mode

#### Doctype

+ DECL_CHAR, LITERAL - do nothing
+ EMPTY, START_TAG_CLOSE - change to Main mode
+ SUBSET_OPEN - change to Subset mode

#### Subset

+ COMMENT, PI, DECL, S - do nothing
+ SUBSET_CLOSE, EMPTY - change to Main mode

## Tree building

The tree building phase turns a sequence of abstract tokens into the MicroXML data model. This is equivalent to transforming the sequence of abstract tokens so that it matches the following grammar for element:

     element ::= start-tag (element|DataChar) EndTag | empty-element
     empty-element ::= StartTagOpen attribute-list EmptyElementTagClose
     start-tag ::= StartTagOpen attribute-list StartTagClose
     attribute-list ::= attribute*
     attribute ::= AttributeName DataChar*

and so that:
+ the start-tag and EndTag in each element have the same name
+ all attributes in an attribute-list have distinct names

### Duplicate attribute handling

If an attribute has the same name as an earlier attribute, it is ignored.

### Start- and end-tag matching

If the name of an end-tag does not matches the name of the current open element, then
+ if the name matches the name of an open element, insert end-tags until that open element becomes the current open element;
+ otherwise, remove the end-tag.

If at the end of input that are open elements, insert end-tags until the open elements are all closed.

### Whitespace stripping

If the abstract token sequence starts with one or more DataChar abstract tokens that are whitespace (ie their code point matches the S lexical token), then these tokens are removed.

If the abstract token sequence ends with one or more DataChar abstract tokens that are whitespace, then these tokens are removed.

### Ensuring that there is a single element

If at this point we do not have a single element, wrap everything in an element named `#doc`.

## TODO

Define an HTML-specific tree builder.

Should there be a CharRef abstract token so that whitespace stripping can take into account whether a character came from a reference or not?

Allow use of HTML5 character names.
