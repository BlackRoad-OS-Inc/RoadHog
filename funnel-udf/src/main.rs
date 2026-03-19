mod parsing;
mod steps;
mod trends;
mod unordered_steps;
mod unordered_trends;

use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::env;
use std::io::{self, BufRead, Write};

#[derive(Debug, Clone, PartialEq, Deserialize, Serialize)]
#[serde(transparent)]
struct PropVal(Value);

fn main() {
    let args: Vec<String> = env::args().collect();
    let arg = args.get(1).map(|x| x.as_str());

    let stdin = io::stdin();
    let mut stdout = io::stdout();

    for line in stdin.lock().lines() {
        if let Ok(line) = line {
            let output = match arg {
                Some("trends") => trends::process_line(&line),
                _ => steps::process_line(&line),
            };
            writeln!(stdout, "{}", output).unwrap();
            stdout.flush().unwrap();
        }
    }
}
