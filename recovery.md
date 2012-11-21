# Error recovery for MicroXML

This specification defines a way to parse any sequence of characters into a generalization of the MicroXML data model. The generalization is that there are no restrictions on the characters that can occur in names or in data.

Parsing is divided in two consecutive phases: tokenization and tree building. Information is passed from the tokenization phase to the tree building phase as a sequence of  _abstract tokens_. Abstract tokens are named in CamelCase and each token may have associated data.  The following abstract tokens are defined:

+ DataChar - associated data is a code point
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
     
### Lexical tokens

The tokenization phase works by dividing up the input into _lexical tokens_. Each lexical token has an associated regular grammar and may also have associated data. Lexical tokens are named in UPPER_CASE. The following defines the possible lexical tokens and their grammars using the same notation as the MicroXML spec.

    DATA_CHAR ::= [#x0-#x10FFFF]
    COMMENT_OPEN ::= "<!--"
    COMMENT_CLOSE ::= "-->"
    SIMPLE_START_TAG ::= START_TAG_OPEN S* START_TAG_CLOSE
    SIMPLE_EMPTY_ELEMENT_TAG ::= START_TAG_OPEN S* EMPTY_ELEMENT_TAG_CLOSE
    START_TAG_ATTRIBUTE ::= START_TAG_OPEN S+ ATTRIBUTE_NAME_EQUALS
    START_TAG_CLOSE ::= ">"
    EMPTY_ELEMENT_TAG_CLOSE ::= "/>"
    END_TAG ::= "</" NAME S* ">"
    START_TAG_OPEN ::= "<" NAME
    ATTRIBUTE_NAME_EQUALS ::= S* NAME S* "="
    NAME ::= NAME_START_CHAR NAME_CHAR*
    NAME_START_CHAR ::= [A-Za-z_:$] | [#x80-#x10FFFF]
    NAME_CHAR ::= NAME_START_CHAR | [0-9] | "-" | "."
    NAMED_CHAR_REF ::= "&" NAME ";"
    NUMERIC_CHAR_REF ::= "&#x" HEX_NUMBER ";"
    HEX_NUMBER ::= [0-9a-fA-F]+
    S ::= #x9 | #xA | #xC | #x20
    SINGLE_QUOTE ::= "'"
    DOUBLE_QUOTE ::= '"'
    PI_OPEN ::= "<?"
    PI_CLOSE ::= "?>"
    CDATA_OPEN ::= "<![CDATA["
    CDATA_CLOSE ::= "]]>"

The associated data for lexical tokens is as follows:

+ START_TAG_OPEN, END_TAG, ATTRIBUTE_NAME_EQUALS and NAMED_CHAR_REF have a string (which is a NAME)
+ START_TAG_ATTRIBUTE has two strings (both NAMES, an element name and an attribute name)
+ NUMERIC_CHAR_REF has a non-negative integer
+ DATA_CHAR has a code-point (a non-negative integer in the range 0 to #x10FFFF)

There are a number of different named tokenization modes.  Each tokenization mode specifies

+ a set of lexical tokens that are recognized in that mode,
+ rules for mapping each recognized lexical token to zero or more abstract tokens, and
+ rules for when to change to another tokenization mode.

The state of the tokenization process consists of
+ the current tokenization mode
+ the current input (a sequence of code-points)

A step in the tokenization process consists of the following.
+ Recognizing the next lexical token. This consists of finding the longest initial subsequence of the input that matches one of the lexical tokens recognized in the current tokenization mode. It is possible for there to be two choices for the longest matching token (eg S and DATA_CHAR in UnquoteAttributeValue mode): in this case, the choice that is not DATA_CHAR must be recognized.
+ Emitting zero or more abstract tokens according to the rules for that lexical token in that tokenization mode.
+ Possibly changing to another tokenization mode according to the rules for that lexical token in that tokenization mode.
+ Changing the current input to be the sequence of characters following the token.

The tokenization process starts with Main as the current tokenization mode, and the input to the tokenization process as the current input, and repeats the tokenization step until the current input is empty. At this point, if the current tokenization mode is one of Tag, StartAttributeValue, UnquoteAttributeValue, SingleQuoteAttributeValue or DoubleQuoteAttributeValue, then a StartTagClose abstract token is emitted.

### Default handling rules

This section defines default handling rules for certain lexical tokens, which are used in the definition of various tokenization modes.

+ DATA_CHAR - emit a DataChar token
+ NAMED_CHAR_REF - if the associated string is a valid character name emit a single DataChar, otherwise emit a DataChar for each character in the NAMED_CHAR_REF 
+ NUMERIC_CHAR_REF - if the associated number is <= #x10FFFF emit a single DataChar, otherwise emit a DataChar for each character in the NUMERIC_CHAR_REF
+ START_TAG_CLOSE - emit a StartTagClose token and change to Main mode
+ EMPTY_ELEMENT_TAG_CLOSE - emit an EmptyElementTagClose token and change to Main mode

### Tokenization modes

This section defines the available tokenization modes.  The only tokens that are recognized in each mode are those that are explicitly mentioned in each mode.

#### Main

+ DATA_CHAR, NAMED_CHAR_REF, NUMERIC_CHAR_REF - default handling
+ COMMENT_OPEN - change to Comment mode
+ SIMPLE_START_TAG - emit a StartTagOpen token followed by a StartTagClose token
+ SIMPLE_EMPTY_ELEMENT_TAG - emit a StartTagOpen token followed by a EmptyElementTagClose token
+ START_TAG_ATTRIBUTE - emit a StartTagOpen token followed by an AttributeName token and change to StartAttributeValue mode
+ END_TAG - emit an EndTag token
+ CDATA_OPEN - change to CData mode
+ PI_OPEN - change to PI mode

#### Comment

+ DATA_CHAR - do nothing
+ COMMENT_CLOSE - change to Main mode

#### Tag

+ ATTRIBUTE_NAME_EQUALS - emit a AttributeName token and change to StartAttributeValue mode
+ DATA_CHAR - emit a StartTagClose and a DataChar token and change to Main mode
+ START_TAG_CLOSE, EMPTY_ELEMENT_TAG_CLOSE - default handling
+ S - do nothing

#### StartAttributeValue

+ S - do nothing
+ SINGLE_QUOTE - change to SingleQuoteAttributeValue mode
+ DOUBLE_QUOTE - change to DoubleQuoteAttributeValue mode
+ DATA_CHAR, NAMED_CHAR_REF, NUMERIC_CHAR_REF - default handling, then change to UnquoteAttributeValue mode
+ START_TAG_CLOSE, EMPTY_ELEMENT_TAG_CLOSE - default handling

#### UnquoteAttributeValue

+ DATA_CHAR, NAMED_CHAR_REF, NUMERIC_CHAR_REF, START_TAG_CLOSE, EMPTY_ELEMENT_TAG_CLOSE - default handling
+ S - change to Tag mode

#### SingleQuoteAttributeValue

+ DATA_CHAR, NAMED_CHAR_REF, NUMERIC_CHAR_REF - default handling
+ SINGLE_QUOTE - change to Tag mode

#### DoubleQuoteAttributeValue

+ DATA_CHAR, NAMED_CHAR_REF, NUMERIC_CHAR_REF - default handling
+ DOUBLE_QUOTE - change to Tag mode

#### CData

+ DATA_CHAR - default handling
+ CDATA_CLOSE - change to Main mode

#### PI

+ DATA_CHAR - do nothing
+ PI_CLOSE - change to Main mode

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

### Stripping BOM and leading whitespace in the prolog

If the sequence of abstract tokens starts with a DataChar token whose code point is #xFEFF, then this DataChar token is removed. Then, if the sequence of abstract tokens starts with one or more DataChar abstract tokens that are whitespace (ie their code point matches the S lexical token), then these DataChar tokens are removed.

### Duplicate attribute handling

If an attribute has the same name as an earlier attribute, it is ignored.

### Start- and end-tag matching

If the name of an end-tag does not matches the name of the current open element, then
+ if the name matches the name of an open element, insert end-tags until that open element becomes the current open element;
+ otherwise, remove the end-tag.

If at the end of input that are open elements, insert end-tags until the open elements are all closed.

### Stripping whitespace in epilog

If the abstract token sequence consists of a single element followed by one or more whitespace DataChar tokens, then these DataChar tokens are removed.

### Ensuring that there is a single element

If at this point we do not have a single element, wrap everything in an element named `#doc`.

## TODO

Need to do newline normalization as an preprocess in tokenization.

Define an HTML-specific tree builder.

Ignore DOCTYPE declarations.

Handle decimal character references.

Maybe handle HTML-style boolean attributes.

Should there be a CharRef abstract token so that whitespace stripping can take into account whether a character came from a reference or not.

Allow use of HTML5 character names.



