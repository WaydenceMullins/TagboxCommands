# Key features
- Supports all [Smart Alias](https://github.com/re621/re621.Legacy/wiki/SmartAlias) syntax
- Can load alias definitions from [Custom CSS](https://e621.net/users/settings?tab=advanced) and from search query
- Commands to sort and group tags alphabetically
- A command to remove a tag, its aliases, and all tags that imply it
- Partial aliases

# Alias syntax
This will replace `coutor` with `countershade_torso`
```
coutor -> countershade_torso  # this is an inline comment
# this is a comment
```
Tags that you want replaced (`coutor`) are antecedents, tags that replace them (`countershade_torso`) are consequents

## Multiple antecedents
`ctsto`, `ctstor`, `couto` or `coutor` will be replaced with `countershade_torso`
```
ctsto ctstor couto coutor -> countershade_torso
```
Spreading over multiple lines is valid syntax
```
ctsto ctstor
couto coutor -> countershade_torso
```

## Partial aliases
```
cts cou > countershade_
```
Partial alias (`>`) removes all space between it and text cursor, and only replaces the first tag to the left of the text cursor

## Multiple consequents
An alias can resolve to multiple consequents
```
ctstota ctstortai
coutota coutortai -> countershade_torso countershade_tail
```
Alias can include other aliases, as long as they are defined before it
```
ctsto ctstor
couto coutor -> countershade_torso

ctsta ctstai
couta coutai -> countershade_tail

ctstota ctstortai
coutota coutortai -> coutor coutai
```
## Wildcard aliases
Asterisk symbol (`*`) is a wildcard that matches any set of (non-whitespace) characters

First `*` in antecedent corresponds to `$1` in consequent, second `*` to `$2` and so on

This allows, for example, to replace `male.penfemale` with `male_penetrating_female`
```
*.pen* -> $1_penetrating_$2
```

## Inline aliases
Alias definitions can be separated with semicolon (`;`) instead of newline
```
alias1->tag1;alias2->tag2;part1>partial1;wc*->wildcard$1
```

# Commands
All command names can be changed in settings

This only affects tag box commands - wildcard and remove characters in alias definitions will still be `*` and `-`

## Normal
By default, using aliases normally does not require any special character

Setting one can allow antecedents to overlap with tags used on e621

## Remove
[example tag box]
```
domestic_cat felid feline felis mammal
blue_eyes countershade_torso countershade_tail fur grey_body grey_fur
2020 hi_res
```
Using `-mammal` on the example tag box will also remove `domestic_cat`, `felid`, `feline` and `felis`

Wildcard is supported. Using `-grey_*` will remove `grey_body` and `grey_fur`

Using remove on alias is supported. With alias from [multiple consequents example](#multiple-consequents) active, using `-coutortai` will remove `countershade_torso` and `countershade_tail`

Remove command can be stored in an alias. With `mamtodra -> -mammal furred_dragon` alias active, using `mamtodra` will remove `mammal` and all tags that imply it, then add `furred_dragon`

## Invert
Using `!mamtodra` will add `mammal` and remove `furred_dragon`

## Add
Using `+mamtodra` will add both `mammal` and `furred_dragon`

## Sorting
Using sort command (`abc` by default) will sort tags in a "group" alphabetically

A "group" is a series of tags separated by newline. There are three "groups" in the example tag box.

Using sort&group command (`abcg` by default) will sort tags and break them into new "groups" alphabetically

# Aliases in search query and Custom CSS
Alias definitions in external sources are marked with \*al\* at the start and at the end

Only the first \*al\* block is loaded, the rest will be ignored

## Search query aliases
Can be loaded temporarily during tagging projects

To pass definitions through search query, use one of the [metatags](https://e621.net/help/cheatsheet), for example:

[male/female artverified:"\*al\*alias1->tag1;alias2->tag2\*al\*"](https://e621.net/posts?tags=male%2Ffemale+artverified%3A%22*al*alias1-%3Etag1%3Balias2-%3Etag2*al*%22)

## [Custom CSS](https://e621.net/users/settings?tab=advanced) aliases
Can be used to keep alias definitions synchronized between devices

Turned off by default. Page reload is required to refresh alias definitions.
```
/*al*
alias1->tag1
alias2->tag2
*al*/

/* (Post/Tag list) Removes quick blacklist, + and - buttons 25-10-20 */
.tag-list-inc, .tag-list-exl, .tag-list-actions {display: none}
```
